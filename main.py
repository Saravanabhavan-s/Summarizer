"""
FastAPI Backend for Call Quality Scoring System
Integrates with the call_quality_scorer module
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
import time
import uuid
import tempfile
from typing import List, Dict
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from call_quality_scorer import evaluate_call_quality
from utils.text_parser import extract_text_from_file
from transcriber import transcribe_audio, summarize_transcript

# ---------------------------------------------------------------------------
# RAG Pipeline Import
# ---------------------------------------------------------------------------
# Import get_rag_response so the RAG pipeline module is loaded at server
# startup. This eagerly initialises the FAISS index on the first call,
# ensuring subsequent evaluation requests reuse the cached retriever.
# The actual RAG retrieval is called inside call_quality_scorer.evaluate_with_llm()
# which injects policy context into the LLM prompt automatically.
# ---------------------------------------------------------------------------
from rag_pipeline import get_rag_response

# ---------------------------------------------------------------------------
# Authentication & Authorization
# ---------------------------------------------------------------------------
# JWT authentication module: user registration, login, token verification,
# and role-based access control (admin vs. regular users).
# admin_db tracks all system metrics, requests, errors, and user activity
# for the admin monitoring dashboard.
# ---------------------------------------------------------------------------
from auth import (
    get_current_user,
    require_admin,
    register_user,
    login_user,
    create_admin_user,
    USERS_DB
)
from admin_db import admin_db

# File-type classification
AUDIO_EXTENSIONS = {'.mp3', '.wav', '.m4a', '.mp4', '.flac', '.ogg', '.wma', '.aac'}
TEXT_EXTENSIONS  = {'.txt', '.pdf', '.docx'}
ALLOWED_EXTENSIONS = AUDIO_EXTENSIONS | TEXT_EXTENSIONS

# ---------------------------------------------------------------------------
# Request Body Models  (JSON body — avoids credentials in query string)
# ---------------------------------------------------------------------------

class LoginBody(BaseModel):
    username: str
    password: str

class RegisterBody(BaseModel):
    username: str
    password: str

class CompareBody(BaseModel):
    ids: List[str]

# ---------------------------------------------------------------------------
# Server-side call history storage (per-user, in-memory)
# In production, replace with PostgreSQL / MongoDB.
# ---------------------------------------------------------------------------
CALL_HISTORY_DB: Dict[str, list] = {}

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Call Quality Scorer API with JWT Auth",
    description="Real-time call quality analysis with RAG, LLM evaluation, and JWT authentication",
    version="2.0.0"
)

# Initialize admin user on startup (development only)
if "admin" not in USERS_DB:
    result = create_admin_user(username="admin", password="admin123")
    print(f"[STARTUP] {result['message']}")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",    # Vite dev server
        "http://localhost:3000",    # Create React App
        "http://localhost:8080",    # Alternative
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# AUTH ROUTES — No Authentication Required
# ============================================================================

# Function: register
# Purpose: Create a new user account with email and password
# Input: username, password (JSON body)
# Output: {"success": bool, "message": str, "user": {user data}}
# Why needed: New users need a way to sign up for the system.
#   Passwords are hashed with bcrypt before storage.
#   New users automatically get "user" role (not admin).
@app.post("/register")
async def register(body: RegisterBody):
    """
    Register a new user account.
    
    Args:
        body.username: Login username (minimum 3 characters)
        body.password: Password (minimum 6 characters, will be hashed)
    
    Returns:
        {"success": bool, "message": str, "user": {user schema}}
    """
    result = register_user(body.username, body.password)
    status_code = 201 if result["success"] else 400
    return JSONResponse(status_code=status_code, content=result)


# Function: login
# Purpose: Authenticate user and return JWT token
# Input: username, password (JSON body)
# Output: {"success": bool, "token": str, "user_id": str, "role": str}
# Why needed: Users send this token with every request.
#   Token is JWT-signed and expires in 24 hours.
#   Token payload includes user_id and role for authorization checks.
@app.post("/login")
async def login(body: LoginBody):
    """
    Login and receive JWT token.
    
    Args:
        body.username: User's login username
        body.password: User's password (plaintext — sent over HTTPS in prod)
    
    Returns:
        {
            "success": bool,
            "token": str (JWT),
            "user_id": str,
            "role": str ("admin" or "user")
        }
    """
    result = login_user(body.username, body.password)
    status_code = 200 if result["success"] else 401
    return JSONResponse(status_code=status_code, content=result)


@app.get("/health")
async def health_check():
    """
    Health check endpoint (no auth required)
    Returns: {"status": "ok", "service": "call_quality_scorer"}
    """
    return {
        "status": "ok",
        "service": "call_quality_scorer",
        "version": "2.0.0",
        "auth": "enabled"
    }


# ============================================================================
# PROTECTED USER ROUTES — Requires JWT Authentication
# ============================================================================

# Function: get_profile
# Purpose: Return the current logged-in user's profile
# Input: JWT token (from Authorization header, auto-extracted by FastAPI)
# Output: {user_id: str, role: str, username: str, created_at: str}
# Why needed: Users need to see their own profile info.
#   Also used by frontend to confirm authentication status.
@app.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    """
    Get the current user's profile.
    
    Args:
        user: Current user from JWT token (auto-injected by FastAPI)
    
    Returns:
        {"user_id": str, "role": str, "username": str, "created_at": str}
    """
    user_id = user["user_id"]
    
    # Look up user in database
    if user_id not in USERS_DB:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_obj = USERS_DB[user_id]
    return {
        "user_id": user_obj.user_id,
        "username": user_obj.username,
        "role": user_obj.role,
        "created_at": user_obj.created_at
    }


# Function: process_call (protected)
# Purpose: Evaluate a transcript or audio file using RAG + LLM
# Input: file (UploadFile) — audio (.mp3/.wav/.m4a) or text (.txt/.pdf/.docx)
#        user (dict) — JWT token payload with user_id and role
# Output: JSON with score, feedback, summary, violations, improvements
# Description:
#   This is the main evaluation endpoint. The flow is:
#     1. Verify JWT token (user must be authenticated)
#     2. Accept and validate the uploaded file
#     3. Transcribe (audio) or extract text (document)
#     4. Summarise the transcript via LLM
#     5. Call evaluate_call_quality() which internally:
#        a. Runs rule-based scoring
#        b. Calls get_rag_response(transcript) to retrieve policy context from FAISS
#        c. Sends transcript + policy context to LLM for evaluation
#        d. Combines rule-based and LLM scores (hybrid aggregation)
#     6. Log the request and result to admin_db
#     7. Return the unified JSON response
#   The RAG integration is transparent — the frontend receives the same JSON
#   format as before, but scores are now grounded in company policy.

# Handle CORS preflight request for process-call
@app.options("/process-call")
async def process_call_preflight():
    """Handle CORS preflight for process-call endpoint"""
    return JSONResponse(content="OK", headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
    })

@app.post("/process-call")
async def process_call(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """
    Process audio file and return quality scores
    
    Args:
        file: Audio or text file
        user: Current authenticated user
    
    Returns:
        {
            "filename": str,
            "duration_seconds": int,
            "summary": str,
            "quality_score": float (0-100),
            "empathy_score": float (0-100),
            "professionalism_score": float (0-100),
            "compliance_score": float (0-100),
            "violations": list[str],
            "improvements": list[str]
        }
    """
    
    if not file:
        admin_db.log_error(
            user_id, "ValidationError", "No file provided", "/process-call"
        )
        raise HTTPException(status_code=400, detail="No file provided")

    # --- Detect file type by extension ---
    user_id = user["user_id"]
    filename_lower = file.filename.lower() if file.filename else ""
    file_ext = Path(filename_lower).suffix
    is_audio = file_ext in AUDIO_EXTENSIONS
    is_text  = file_ext in TEXT_EXTENSIONS

    # Fallback: accept audio MIME even without a known extension
    if not is_audio and not is_text:
        content_type = file.content_type or ""
        if content_type.startswith('audio/') or 'audio' in content_type.lower():
            is_audio = True

    if not is_audio and not is_text:
        error_detail = f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}. Got: {file.filename}"
        admin_db.log_error(
            user_id, "FileTypeError", error_detail, "/process-call"
        )
        raise HTTPException(status_code=400, detail=error_detail)

    # Validate file size (100 MB max)
    max_size = 100 * 1024 * 1024

    temp_path = None
    eval_start = time.monotonic()
    
    try:
        # Save uploaded bytes to a temp file with the original extension
        contents = await file.read()
        if len(contents) > max_size:
            admin_db.log_error(
                user_id, "FileSizeError", "File exceeds 100MB limit", "/process-call"
            )
            raise HTTPException(status_code=413, detail="File too large (max 100MB)")

        tmp = tempfile.NamedTemporaryFile(
            delete=False, suffix=file_ext or '.tmp'
        )
        tmp.write(contents)
        tmp.close()
        temp_path = tmp.name

        # -------------------------------------------------
        # Branch: Audio vs Text
        # -------------------------------------------------

        if is_audio:
            # Existing audio pipeline: Deepgram transcription → summarise → score
            transcription = transcribe_audio(temp_path)
            transcript = transcription["transcript"]
            duration_seconds = transcription["duration_seconds"]
            summary = summarize_transcript(transcript)
        else:
            # Text pipeline: extract text → summarise → score
            transcript = extract_text_from_file(temp_path)
            if not transcript.strip():
                admin_db.log_error(
                    user_id, "EmptyDocumentError", "Uploaded document is empty", "/process-call"
                )
                raise HTTPException(
                    status_code=400,
                    detail="The uploaded document is empty or could not be read.",
                )
            duration_seconds = 0
            summary = summarize_transcript(transcript)

        # Unified scoring (same for both branches)
        result = evaluate_call_quality(transcript, verbose=False)
        time_taken_seconds = round(time.monotonic() - eval_start, 2)
        
        # Format response
        result_id = str(uuid.uuid4())
        response = {
            "id": result_id,
            "filename": file.filename,
            "duration_seconds": int(duration_seconds),
            "summary": summary,
            "quality_score": round(result['quality_score'], 1),
            "empathy_score": round(result['empathy_score'], 1),
            "professionalism_score": round(result['professionalism_score'], 1),
            "compliance_score": round(result['compliance_score'], 1),
            "language_detected": result.get('language_detected', 'Unknown'),
            "language_proficiency_score": (
                round(result['language_proficiency_score'], 1)
                if result.get('language_proficiency_score') is not None else None
            ),
            "efficiency_score": (
                round(result['efficiency_score'], 1)
                if result.get('efficiency_score') is not None else None
            ),
            "bias_reduction_score": (
                round(result['bias_reduction_score'], 1)
                if result.get('bias_reduction_score') is not None else None
            ),
            "customer_emotion": result.get('customer_emotion', 'Unknown'),
            "sales_opportunity_score": (
                round(result['sales_opportunity_score'], 1)
                if result.get('sales_opportunity_score') is not None else None
            ),
            "time_taken_seconds": time_taken_seconds,
            "violations": result['violations'],
            "improvements": result['improvements']
        }
        
        # Save to server-side history for this user
        history_entry = {
            **response,
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": user_id,
        }
        if user_id not in CALL_HISTORY_DB:
            CALL_HISTORY_DB[user_id] = []
        CALL_HISTORY_DB[user_id].insert(0, history_entry)
        # Keep max 50 entries per user
        CALL_HISTORY_DB[user_id] = CALL_HISTORY_DB[user_id][:50]
        
        # Log successful request to admin_db
        admin_db.log_request(
            user_id=user_id,
            endpoint="/process-call",
            method="POST",
            status_code=200,
            duration_ms=time_taken_seconds * 1000,
            filename=file.filename or "unknown",
            success=True
        )
        
        return JSONResponse(status_code=200, content=response)
        
    except HTTPException:
        # Log failed request
        admin_db.log_request(
            user_id=user_id,
            endpoint="/process-call",
            method="POST",
            status_code=400,
            duration_ms=(time.monotonic() - eval_start) * 1000,
            filename=file.filename or "unknown",
            success=False
        )
        raise
    except Exception as e:
        # Log error
        admin_db.log_error(
            user_id, type(e).__name__, str(e), "/process-call", ""
        )
        admin_db.log_request(
            user_id=user_id,
            endpoint="/process-call",
            method="POST",
            status_code=500,
            duration_ms=(time.monotonic() - eval_start) * 1000,
            filename=file.filename or "unknown",
            success=False
        )
        raise HTTPException(
            status_code=500,
            detail=f"Error processing file: {str(e)}"
        )
    finally:
        # Clean up temporary file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass


# ============================================================================
# HISTORY & COMPARISON ROUTES — Requires JWT Authentication
# ============================================================================

# Function: get_history
# Purpose: Return the authenticated user's call evaluation history
# Input: JWT token (Authorization header)
# Output: {"history": list[result], "total": int}
@app.get("/history")
async def get_history(user: dict = Depends(get_current_user)):
    """Return server-side call history for the current user."""
    user_id = user["user_id"]
    history = CALL_HISTORY_DB.get(user_id, [])
    return {"history": history, "total": len(history)}


# Function: get_result
# Purpose: Return a single call result by ID
# Input: result_id (path param), JWT token
# Output: result dict or 404
@app.get("/result/{result_id}")
async def get_result(result_id: str, user: dict = Depends(get_current_user)):
    """Return a single call evaluation result by ID."""
    user_id = user["user_id"]
    history = CALL_HISTORY_DB.get(user_id, [])
    for entry in history:
        if entry.get("id") == result_id:
            return entry
    raise HTTPException(status_code=404, detail="Result not found")


# Function: compare_results
# Purpose: Return multiple results side-by-side for comparison
# Input: {"ids": ["uuid1", "uuid2"]} JSON body, JWT token
# Output: {"results": list[result]}  (min 2, max 5)
@app.post("/compare")
async def compare_results(body: CompareBody, user: dict = Depends(get_current_user)):
    """Return multiple call results for side-by-side comparison."""
    if len(body.ids) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 result IDs to compare")
    user_id = user["user_id"]
    history = CALL_HISTORY_DB.get(user_id, [])
    id_to_entry = {e["id"]: e for e in history if "id" in e}
    results = [id_to_entry[rid] for rid in body.ids if rid in id_to_entry]
    if len(results) < 2:
        raise HTTPException(status_code=404, detail="Could not find enough results to compare")
    return {"results": results}


# ============================================================================
# ADMIN-ONLY ROUTES — Requires JWT with Admin Role
# ============================================================================

# Function: admin_stats
# Purpose: Return system-wide statistics for admin monitoring dashboard
# Input: JWT token (must have role="admin")
# Output: {total_requests, success_rate, error_count, active_users, avg_duration}
# Why needed: Admins monitor system health and usage patterns.
#   Shows peak usage times, error rates, and performance metrics.
#   Used to detect issues and plan capacity.
@app.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_admin)):
    """Get system-wide statistics (admin only)."""
    return admin_db.get_stats()


# Function: admin_logs
# Purpose: Return recent API request logs for debugging
# Input: JWT token (must have role="admin"), limit query param
# Output: list[request_log_dict] sorted by timestamp (newest first)
# Why needed: Admins need to see what requests were made, by whom, and if they failed.
#   Helps debug issues and detect suspicious activity.
@app.get("/admin/logs")
async def admin_logs(limit: int = 50, user: dict = Depends(require_admin)):
    """Get recent request logs (admin only)."""
    return admin_db.get_request_logs(limit=limit)


# Function: admin_errors
# Purpose: Return recent error logs for alerting and debugging
# Input: JWT token (must have role="admin"), limit query param
# Output: list[error_log_dict] sorted by timestamp (newest first)
# Why needed: Errors are critical. Admins must see them immediately
#   to respond and file bug reports.
@app.get("/admin/errors")
async def admin_errors(limit: int = 50, user: dict = Depends(require_admin)):
    """Get recent error logs (admin only)."""
    return admin_db.get_error_logs(limit=limit)


# Function: admin_users
# Purpose: Return per-user statistics for identifying heavy users and issues
# Input: JWT token (must have role="admin")
# Output: {user_id: {request_count, success_rate, last_activity}}
# Why needed: Admins can see which users are active, who might have issues (high failure rate),
#   and who is heavy users needing support or account review.
@app.get("/admin/users")
async def admin_users(user: dict = Depends(require_admin)):
    """Get per-user statistics (admin only)."""
    return admin_db.get_user_stats()


# Function: admin_endpoints
# Purpose: Return per-endpoint statistics for API health monitoring
# Input: JWT token (must have role="admin")
# Output: {endpoint: {total_requests, success_count, failure_count, avg_duration_ms}}
# Why needed: Admins monitor which endpoints are used most, how fast they are,
#   and which might have reliability issues needing investigation.
@app.get("/admin/endpoints")
async def admin_endpoints(user: dict = Depends(require_admin)):
    """Get per-endpoint statistics (admin only)."""
    return admin_db.get_endpoint_stats()


@app.get("/")
async def root():
    """
    Root endpoint with API information
    """
    return {
        "service": "Call Quality Scorer API with JWT Auth",
        "version": "2.0.0",
        "documentation": "/docs",
        "auth": "JWT (Bearer token)",
        "endpoints": {
            "auth": {
                "register": "POST /register",
                "login": "POST /login",
                "profile": "GET /profile"
            },
            "protected": {
                "evaluate": "POST /process-call (requires auth)"
            },
            "admin": {
                "stats": "GET /admin/stats (admin only)",
                "logs": "GET /admin/logs (admin only)",
                "errors": "GET /admin/errors (admin only)",
                "users": "GET /admin/users (admin only)",
                "endpoints": "GET /admin/endpoints (admin only)"
            },
            "health": "GET /health"
        }
    }


@app.get("/docs-summary")
async def docs_summary():
    """
    Simple documentation summary
    """
    return {
        "title": "Call Quality Scorer API v2.0 with JWT Auth",
        "description": "Real-time call quality analysis with RAG, LLM evaluation, and JWT authentication",
        "quick_start": {
            "step_1": "POST /register with {username, password}",
            "step_2": "POST /login with {username, password}",
            "step_3": "Use returned token in Authorization header: Bearer <token>",
            "step_4": "POST /process-call with file (requires token)"
        },
        "default_admin": "username=admin, password=admin123",
        "endpoints_summary": {
            "public": ["/register", "/login", "/health"],
            "protected": ["/profile", "/process-call"],
            "admin_only": ["/admin/stats", "/admin/logs", "/admin/errors", "/admin/users", "/admin/endpoints"]
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    # Get port from environment or default to 8000
    port = int(os.getenv("PORT", 8000))
    
    print(f"🚀 Starting Call Quality Scorer API on http://localhost:{port}")
    print(f"📖 Documentation: http://localhost:{port}/docs")
    print(f"🏥 Health check: http://localhost:{port}/health")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        reload=False
    )
