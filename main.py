"""
FastAPI Backend for Call Quality Scoring System
Integrates with the call_quality_scorer module
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query, Response, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
import os
import json
import time
import uuid
import tempfile
import shutil
from typing import List, Dict, Optional, Any, Tuple
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from call_quality_scorer import (
    evaluate_call_quality,
    get_scoring_parameters,
    update_scoring_parameters,
    reset_scoring_parameters,
)
from utils.text_parser import extract_text_from_file
from utils.reporting import (
    generate_call_report_pdf,
    generate_analytics_report_pdf,
    generate_analytics_csv,
    build_call_report_data,
)
from transcriber import transcribe_audio, summarize_transcript

# Load environment variables before importing modules that read env at import-time.
load_dotenv()

# ---------------------------------------------------------------------------
# RAG Pipeline Import
# ---------------------------------------------------------------------------
# Import get_rag_response so the RAG pipeline module is loaded at server
# startup. This eagerly initialises the FAISS index on the first call,
# ensuring subsequent evaluation requests reuse the cached retriever.
# The actual RAG retrieval is called inside call_quality_scorer.evaluate_with_llm()
# which injects policy context into the LLM prompt automatically.
# ---------------------------------------------------------------------------
from rag_pipeline import (
    get_rag_response,
    rebuild_retriever,
    get_rag_status,
    set_policy_path,
    get_policy_path,
)
from live_transcription import live_router

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
    USERS_DB,
    list_users as list_auth_users,
    add_user_by_admin,
    delete_user as delete_auth_user,
    block_user as block_auth_user,
    unblock_user as unblock_auth_user,
    assign_role as assign_auth_role,
    get_user_activity,
    record_user_activity,
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


class AdminCreateUserBody(BaseModel):
    username: str
    password: str
    role: str = "user"


class RoleUpdateBody(BaseModel):
    role: str


class PolicyUpdateBody(BaseModel):
    content: str


class EchoScoreRunBody(BaseModel):
    transcript: str
    call_name: str = "manual_call.txt"
    user_id: Optional[str] = None


class LiveChunkScoreBody(BaseModel):
    index: int
    time_start: float = 0.0
    time_end: float = 0.0
    text: str
    score: Optional[float] = None
    fluency: Optional[float] = None
    confidence: Optional[float] = None
    clarity: Optional[float] = None
    sentiment: Optional[str] = None
    engagement: Optional[float] = None
    alerts: List[str] = Field(default_factory=list)


class LiveSessionCompleteBody(BaseModel):
    audio_name: str
    transcription: str
    duration_seconds: float = 0.0
    chunk_scores: List[LiveChunkScoreBody] = Field(default_factory=list)
    alerts: List[Any] = Field(default_factory=list)
    report_data: Dict[str, Any] = Field(default_factory=dict)


class EchoScoreParamsBody(BaseModel):
    openrouter_model: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    empathy_weights: Optional[Dict[str, float]] = None
    professionalism_weights: Optional[Dict[str, float]] = None
    compliance_weights: Optional[Dict[str, float]] = None
    final_weights: Optional[Dict[str, float]] = None


class SettingsUpdateBody(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    scoring_rules: Optional[Dict[str, Any]] = None
    feature_flags: Optional[Dict[str, bool]] = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class UpdateDisplayNameBody(BaseModel):
    display_name: str


class UpdateOrganizationBody(BaseModel):
    organization: str


class TOTPVerifyBody(BaseModel):
    code: str


class UserPolicyUploadBody(BaseModel):
    policy_type: str = "general"


# ---------------------------------------------------------------------------
# Server-side call history storage (per-user, in-memory)
# In production, replace with PostgreSQL / MongoDB.
# ---------------------------------------------------------------------------
CALL_HISTORY_DB: Dict[str, list] = {}

BASE_DIR = Path(__file__).resolve().parent
REPORTS_DIR = BASE_DIR / "generated_reports"
TRANSCRIPTS_DIR = BASE_DIR / "generated_transcripts"
POLICY_DIR = BASE_DIR / "policy_files"
ACTIVE_POLICY_PATH = BASE_DIR / "policy.txt"
HISTORY_DB_PATH = BASE_DIR / "call_history_db.json"

REPORTS_DIR.mkdir(exist_ok=True)
TRANSCRIPTS_DIR.mkdir(exist_ok=True)
POLICY_DIR.mkdir(exist_ok=True)
set_policy_path(str(ACTIVE_POLICY_PATH))

SYSTEM_SETTINGS: Dict[str, Any] = {
    "model": os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
    "api_key_set": bool(os.getenv("OPENROUTER_API_KEY")),
    "scoring_rules": {
        "final_weights": {
            "empathy": 0.35,
            "professionalism": 0.30,
            "compliance": 0.35,
        }
    },
    "feature_flags": {
        "admin_dashboard": True,
        "pdf_reports": True,
        "history_downloads": True,
        "rag_enabled": True,
    },
}


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _sanitize_filename(name: str) -> str:
    if not name:
        return "file"
    safe = "".join(ch for ch in name if ch.isalnum() or ch in ("-", "_", "."))
    return safe.strip(".") or "file"


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


def _normalize_live_alerts(alerts: List[Any]) -> List[dict]:
    rows: List[dict] = []
    for item in alerts or []:
        text = ""
        chunk = None

        if isinstance(item, dict):
            text = str(item.get("text") or "").strip()
            chunk_value = item.get("chunk")
            if chunk_value is not None:
                try:
                    chunk = int(chunk_value)
                except (TypeError, ValueError):
                    chunk = None
        else:
            text = str(item).strip()

        if not text:
            continue

        row = {"text": text}
        if chunk is not None and chunk >= 0:
            row["chunk"] = chunk

        rows.append(row)

    return rows[:200]


def _load_history_db() -> Dict[str, list]:
    """Load persisted history DB from disk (best-effort)."""
    if not HISTORY_DB_PATH.exists():
        return {}

    try:
        raw = HISTORY_DB_PATH.read_text(encoding="utf-8")
        payload = json.loads(raw)
    except Exception as exc:
        print(f"[WARN] Failed to load history DB: {exc}")
        return {}

    if not isinstance(payload, dict):
        return {}

    restored: Dict[str, list] = {}
    for user_id, entries in payload.items():
        if not isinstance(entries, list):
            continue

        valid_entries = [entry for entry in entries if isinstance(entry, dict)]
        restored[str(user_id)] = valid_entries

    return restored


def _save_history_db() -> None:
    """Persist current in-memory history DB to disk (best-effort)."""
    try:
        HISTORY_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = HISTORY_DB_PATH.with_suffix(".tmp")
        temp_path.write_text(
            json.dumps(CALL_HISTORY_DB, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )
        temp_path.replace(HISTORY_DB_PATH)
    except Exception as exc:
        print(f"[WARN] Failed to persist history DB: {exc}")


def _resolve_report_path(entry: dict) -> Path:
    filename = _sanitize_filename(Path(entry.get("filename", "call")).stem)
    return REPORTS_DIR / f"{entry['id']}_{filename}.pdf"


def _resolve_transcript_path(entry: dict) -> Path:
    filename = _sanitize_filename(Path(entry.get("filename", "call")).stem)
    return TRANSCRIPTS_DIR / f"{entry['id']}_{filename}.txt"


def _find_result_entry(result_id: str) -> Tuple[Optional[str], Optional[dict]]:
    for user_id, items in CALL_HISTORY_DB.items():
        for entry in items:
            if str(entry.get("id")) == str(result_id):
                return user_id, entry
    return None, None


def _remove_result_entry(result_id: str) -> bool:
    owner, _ = _find_result_entry(result_id)
    if not owner:
        return False

    entries = CALL_HISTORY_DB.get(owner, [])
    CALL_HISTORY_DB[owner] = [e for e in entries if str(e.get("id")) != str(result_id)]
    _save_history_db()
    return True


def _all_history_entries() -> List[dict]:
    rows = []
    for user_id, entries in CALL_HISTORY_DB.items():
        username = USERS_DB.get(user_id).username if USERS_DB.get(user_id) else user_id
        for entry in entries:
            rows.append({**entry, "username": username, "user_id": user_id})
    rows.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
    return rows


def _save_transcript_artifact(entry: dict, transcript: str) -> str:
    transcript_path = _resolve_transcript_path(entry)
    transcript_path.write_text(transcript or "", encoding="utf-8")
    return str(transcript_path)


def _public_result(entry: dict) -> dict:
    """Return a client-safe result payload without internal file paths."""
    data = dict(entry)
    transcript_path = data.pop("transcript_path", None)
    report_path = data.pop("report_pdf_path", None)
    data["transcript_available"] = bool(transcript_path and Path(transcript_path).exists())
    data["report_pdf_available"] = bool(report_path and Path(report_path).exists())
    return data


def _ensure_report_artifact(entry: dict) -> str:
    report_path = _resolve_report_path(entry)
    previous_report_path = entry.get("report_pdf_path")

    if report_path.exists():
        entry["report_pdf_path"] = str(report_path)
        if entry.get("report_pdf_path") != previous_report_path:
            _save_history_db()
        return str(report_path)

    generate_call_report_pdf(entry, str(report_path))
    entry["report_pdf_path"] = str(report_path)
    _save_history_db()
    return str(report_path)


def _ensure_owner_or_admin(user: dict, owner_user_id: str) -> None:
    if user.get("role") == "admin":
        return
    if user.get("user_id") != owner_user_id:
        raise HTTPException(status_code=403, detail="You are not authorized to access this result")


def _filter_rows(
    rows: List[dict],
    user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
) -> List[dict]:
    filtered = rows

    if user_id:
        filtered = [r for r in filtered if str(r.get("user_id")) == str(user_id)]

    if start_date:
        filtered = [r for r in filtered if (r.get("timestamp") or "") >= start_date]

    if end_date:
        filtered = [r for r in filtered if (r.get("timestamp") or "") <= end_date]

    if min_score is not None:
        filtered = [r for r in filtered if float(r.get("quality_score") or 0) >= float(min_score)]

    if max_score is not None:
        filtered = [r for r in filtered if float(r.get("quality_score") or 0) <= float(max_score)]

    return filtered


def _analytics_summary(rows: List[dict]) -> dict:
    if not rows:
        return {
            "total_calls": 0,
            "avg_score": 0,
            "avg_empathy": 0,
            "avg_compliance": 0,
            "avg_efficiency": 0,
        }

    total = len(rows)
    return {
        "total_calls": total,
        "avg_score": round(sum(float(r.get("quality_score") or 0) for r in rows) / total, 1),
        "avg_empathy": round(sum(float(r.get("empathy_score") or 0) for r in rows) / total, 1),
        "avg_compliance": round(sum(float(r.get("compliance_score") or 0) for r in rows) / total, 1),
        "avg_efficiency": round(sum(float(r.get("efficiency_score") or 0) for r in rows) / total, 1),
    }


CALL_HISTORY_DB = _load_history_db()
if CALL_HISTORY_DB:
    restored_total = sum(len(v) for v in CALL_HISTORY_DB.values())
    print(f"[STARTUP] Restored {restored_total} history entries from disk")

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
    allow_origin_regex=r"https://.*|http://localhost(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.options("/{full_path:path}")
async def cors_preflight_handler(full_path: str):
    """Global OPTIONS fallback; CORSMiddleware injects CORS headers for allowed origins."""
    return Response(status_code=204)

# Register live-transcription router (new feature — additive only)
app.include_router(live_router)



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
        "created_at": user_obj.created_at,
        "blocked": user_obj.blocked,
        "last_login": user_obj.last_login,
        "last_activity": user_obj.last_activity,
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
    
    user_id = user["user_id"]

    if not file:
        admin_db.log_error(
            user_id, "ValidationError", "No file provided", "/process-call"
        )
        raise HTTPException(status_code=400, detail="No file provided")

    # --- Detect file type by extension ---
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
            # Audio pipeline: Deepgram transcription with speaker diarization
            transcription = transcribe_audio(temp_path)
            transcript = transcription["transcript"]
            formatted_transcript = transcription.get("formatted_transcript", transcript)
            speaker_map = transcription.get("speaker_map", {"0": "Agent", "1": "Customer"})
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
            # Text files may already have Agent:/Customer: labels — preserve as-is
            formatted_transcript = transcript
            speaker_map = {"Agent": "Agent", "Customer": "Customer"}
            summary = summarize_transcript(transcript)

        # Unified scoring (same for both branches)
        result = evaluate_call_quality(transcript, verbose=False)
        time_taken_seconds = round(time.monotonic() - eval_start, 2)
        efficiency_score = (
            round(result['efficiency_score'], 1)
            if result.get('efficiency_score') is not None else None
        )
        compliance_score = round(result['compliance_score'], 1)
        resolution_score = round(
            (compliance_score + (efficiency_score if efficiency_score is not None else compliance_score)) / 2,
            1,
        )
        tokens_used = _estimate_tokens(transcript) + 400
        
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
            "compliance_score": compliance_score,
            "resolution_score": resolution_score,
            "language_detected": result.get('language_detected', 'Unknown'),
            "language_proficiency_score": (
                round(result['language_proficiency_score'], 1)
                if result.get('language_proficiency_score') is not None else None
            ),
            "efficiency_score": efficiency_score,
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
            "report_pdf_available": False,
            "transcript_available": True,
            "violations": result['violations'],
            "improvements": result['improvements'],
            "formatted_transcript": formatted_transcript,
            "speaker_map": speaker_map,
        }
        
        # Save to server-side history for this user
        history_entry = {
            **response,
            "timestamp": _now_iso(),
            "user_id": user_id,
            "tokens_used_estimate": tokens_used,
        }
        history_entry["transcript_path"] = _save_transcript_artifact(history_entry, transcript)

        if user_id not in CALL_HISTORY_DB:
            CALL_HISTORY_DB[user_id] = []
        CALL_HISTORY_DB[user_id].insert(0, history_entry)
        # Keep max 50 entries per user
        CALL_HISTORY_DB[user_id] = CALL_HISTORY_DB[user_id][:50]
        _save_history_db()

        record_user_activity(user_id)
        
        # Log successful request to admin_db
        admin_db.log_request(
            user_id=user_id,
            endpoint="/process-call",
            method="POST",
            status_code=200,
            duration_ms=time_taken_seconds * 1000,
            filename=file.filename or "unknown",
            success=True,
            tokens_used=tokens_used,
        )
        admin_db.log_scoring(
            user_id=user_id,
            result_id=result_id,
            filename=file.filename or "unknown",
            quality_score=response["quality_score"],
            empathy_score=response["empathy_score"],
            compliance_score=response["compliance_score"],
            efficiency_score=response.get("efficiency_score") or 0,
            duration_ms=time_taken_seconds * 1000,
            tokens_used=tokens_used,
        )
        
        return JSONResponse(status_code=200, content=response)
        
    except HTTPException as http_error:
        # Log failed request
        admin_db.log_request(
            user_id=user_id,
            endpoint="/process-call",
            method="POST",
            status_code=http_error.status_code,
            duration_ms=(time.monotonic() - eval_start) * 1000,
            filename=file.filename or "unknown",
            success=False
        )
        raise http_error
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
            except OSError as cleanup_error:
                admin_db.log_error(
                    user_id,
                    "TempFileCleanupError",
                    f"Failed to delete temporary upload file: {temp_path}",
                    "/process-call",
                    str(cleanup_error),
                )


@app.post("/api/live-session-complete")
async def save_live_session_complete(body: LiveSessionCompleteBody, user: dict = Depends(get_current_user)):
    """Persist a completed live transcription session using the standard history schema."""
    user_id = user["user_id"]
    transcript = str(body.transcription or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Live transcription is empty")

    eval_start = time.monotonic()

    try:
        result = evaluate_call_quality(transcript, verbose=False)
        elapsed = round(time.monotonic() - eval_start, 2)

        efficiency_score = (
            round(result["efficiency_score"], 1)
            if result.get("efficiency_score") is not None else None
        )
        compliance_score = round(result["compliance_score"], 1)
        result_id = str(uuid.uuid4())
        filename = str(body.audio_name or "live_transcription.wav").strip() or "live_transcription.wav"
        tokens_used = _estimate_tokens(transcript) + 400

        chunk_scores = [chunk.model_dump() for chunk in body.chunk_scores]
        alerts = _normalize_live_alerts(body.alerts)
        report_data = dict(body.report_data or {})
        report_data.setdefault("transcription", transcript)
        report_data.setdefault("chunk_scores", chunk_scores)
        report_data.setdefault("alerts", alerts)
        report_data.setdefault("overall_score", round(result["quality_score"], 1))
        report_data.setdefault(
            "feedback",
            {
                "violations": result.get("violations", []),
                "improvements": result.get("improvements", []),
            },
        )

        history_entry = {
            "id": result_id,
            "filename": filename,
            "duration_seconds": int(body.duration_seconds or 0),
            "summary": summarize_transcript(transcript),
            "quality_score": round(result["quality_score"], 1),
            "empathy_score": round(result["empathy_score"], 1),
            "professionalism_score": round(result["professionalism_score"], 1),
            "compliance_score": compliance_score,
            "resolution_score": round(
                (compliance_score + (efficiency_score if efficiency_score is not None else compliance_score)) / 2,
                1,
            ),
            "language_detected": result.get("language_detected", "Unknown"),
            "language_proficiency_score": (
                round(result["language_proficiency_score"], 1)
                if result.get("language_proficiency_score") is not None else None
            ),
            "efficiency_score": efficiency_score,
            "bias_reduction_score": (
                round(result["bias_reduction_score"], 1)
                if result.get("bias_reduction_score") is not None else None
            ),
            "customer_emotion": result.get("customer_emotion", "Unknown"),
            "sales_opportunity_score": (
                round(result["sales_opportunity_score"], 1)
                if result.get("sales_opportunity_score") is not None else None
            ),
            "time_taken_seconds": elapsed,
            "report_pdf_available": False,
            "transcript_available": True,
            "violations": result.get("violations", []),
            "improvements": result.get("improvements", []),
            "timestamp": _now_iso(),
            "user_id": user_id,
            "tokens_used_estimate": tokens_used,
            "source_type": "live",
            "live_tag": "LIVE",
            "transcription": transcript,
            "chunk_scores": chunk_scores,
            "alerts": alerts,
            "report_data": report_data,
        }

        history_entry["transcript_path"] = _save_transcript_artifact(history_entry, transcript)

        if user_id not in CALL_HISTORY_DB:
            CALL_HISTORY_DB[user_id] = []
        CALL_HISTORY_DB[user_id].insert(0, history_entry)
        CALL_HISTORY_DB[user_id] = CALL_HISTORY_DB[user_id][:50]
        _save_history_db()
        record_user_activity(user_id)

        admin_db.log_request(
            user_id=user_id,
            endpoint="/api/live-session-complete",
            method="POST",
            status_code=200,
            duration_ms=elapsed * 1000,
            filename=filename,
            success=True,
            tokens_used=tokens_used,
        )
        admin_db.log_scoring(
            user_id=user_id,
            result_id=result_id,
            filename=filename,
            quality_score=history_entry["quality_score"],
            empathy_score=history_entry["empathy_score"],
            compliance_score=history_entry["compliance_score"],
            efficiency_score=history_entry.get("efficiency_score") or 0,
            duration_ms=elapsed * 1000,
            tokens_used=tokens_used,
        )

        return {"success": True, "result": _public_result(history_entry)}

    except HTTPException:
        raise
    except Exception as exc:
        admin_db.log_error(
            user_id,
            type(exc).__name__,
            str(exc),
            "/api/live-session-complete",
            "",
        )
        admin_db.log_request(
            user_id=user_id,
            endpoint="/api/live-session-complete",
            method="POST",
            status_code=500,
            duration_ms=(time.monotonic() - eval_start) * 1000,
            filename=str(body.audio_name or "live_transcription.wav"),
            success=False,
        )
        raise HTTPException(status_code=500, detail="Failed to save live session") from exc


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
    return {"history": [_public_result(item) for item in history], "total": len(history)}


# Function: get_result
# Purpose: Return a single call result by ID
# Input: result_id (path param), JWT token
# Output: result dict or 404
@app.get("/result/{result_id}")
async def get_result(result_id: str, user: dict = Depends(get_current_user)):
    """Return a single call evaluation result by ID."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Result not found")

    _ensure_owner_or_admin(user, owner_user_id)
    return _public_result(entry)


@app.get("/result/{result_id}/report/pdf")
async def download_result_pdf(result_id: str, user: dict = Depends(get_current_user)):
    """Download call report PDF for a result; generate it if missing."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Result not found")

    _ensure_owner_or_admin(user, owner_user_id)

    try:
        report_path = _ensure_report_artifact(entry)
    except Exception as exc:
        admin_db.log_error(owner_user_id, type(exc).__name__, str(exc), "/result/{result_id}/report/pdf")
        raise HTTPException(status_code=500, detail="Failed to generate report PDF") from exc

    return FileResponse(
        report_path,
        media_type="application/pdf",
        filename=Path(report_path).name,
    )


@app.get("/result/{result_id}/transcript/download")
async def download_result_transcript(result_id: str, user: dict = Depends(get_current_user)):
    """Download transcript text for a specific result."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Result not found")

    _ensure_owner_or_admin(user, owner_user_id)

    transcript_path = entry.get("transcript_path")
    if not transcript_path or not Path(transcript_path).exists():
        raise HTTPException(status_code=404, detail="Transcript not available")

    return FileResponse(
        transcript_path,
        media_type="text/plain",
        filename=Path(transcript_path).name,
    )


@app.get("/history/{result_id}/report/pdf")
async def download_history_pdf(result_id: str, user: dict = Depends(get_current_user)):
    """History alias for PDF download endpoint."""
    return await download_result_pdf(result_id=result_id, user=user)


@app.get("/history/{result_id}/transcript/download")
async def download_history_transcript(result_id: str, user: dict = Depends(get_current_user)):
    """History alias for transcript download endpoint."""
    return await download_result_transcript(result_id=result_id, user=user)


@app.post("/result/{result_id}/report/generate")
async def generate_result_pdf(result_id: str, user: dict = Depends(get_current_user)):
    """Generate report PDF on demand and return metadata."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Result not found")

    _ensure_owner_or_admin(user, owner_user_id)
    report_path = _ensure_report_artifact(entry)
    return {
        "success": True,
        "result_id": result_id,
        "report_pdf_available": True,
        "filename": Path(report_path).name,
    }


@app.get("/history/{result_id}")
async def get_history_entry(result_id: str, user: dict = Depends(get_current_user)):
    """History alias for getting a single result."""
    return await get_result(result_id=result_id, user=user)


@app.get("/history/{result_id}/actions")
async def get_history_entry_actions(result_id: str, user: dict = Depends(get_current_user)):
    """Return available actions for a history row."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Result not found")

    _ensure_owner_or_admin(user, owner_user_id)
    public = _public_result(entry)
    return {
        "result_id": result_id,
        "actions": [
            "view",
            "download_pdf",
            "download_transcript",
        ],
        "availability": {
            "report_pdf": public.get("report_pdf_available", False),
            "transcript": public.get("transcript_available", False),
        },
    }


# Function: compare_results
# Purpose: Return multiple results side-by-side for comparison
# Input: {"ids": ["uuid1", "uuid2"]} JSON body, JWT token
# Output: {"results": list[result]}  (min 2, max 5)
@app.post("/compare")
async def compare_results(body: CompareBody, user: dict = Depends(get_current_user)):
    """Return multiple call results for side-by-side comparison."""
    if len(body.ids) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 result IDs to compare")

    accessible_entries = CALL_HISTORY_DB.get(user["user_id"], [])
    if user.get("role") == "admin":
        accessible_entries = _all_history_entries()

    id_to_entry = {str(e["id"]): e for e in accessible_entries if "id" in e}
    results = [id_to_entry[str(rid)] for rid in body.ids if str(rid) in id_to_entry]
    if len(results) < 2:
        raise HTTPException(status_code=404, detail="Could not find enough results to compare")
    return {"results": [_public_result(item) for item in results]}


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
    return {
        "activity_stats": admin_db.get_user_stats(),
        "users": list_auth_users(),
    }


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


@app.get("/admin")
async def admin_overview(user: dict = Depends(require_admin)):
    """Admin overview payload used by the advanced admin dashboard."""
    return {
        "sections": [
            "Overview",
            "Users",
            "Policies",
            "Calls",
            "EchoScore",
            "Reports",
            "Logs",
            "Settings",
            "Security",
        ],
        "stats": admin_db.get_stats(),
        "api_usage": admin_db.get_api_usage_summary(),
    }


@app.get("/admin/health")
async def admin_health(user: dict = Depends(require_admin)):
    """Return API + RAG + LLM health status."""
    scoring = get_scoring_parameters()
    rag_status = get_rag_status()
    return {
        "api": {
            "status": "ok",
            "version": "2.0.0",
        },
        "rag": rag_status,
        "llm": {
            "status": "ready" if scoring.get("has_api_key") else "missing_api_key",
            "model": scoring.get("openrouter_model"),
            "has_api_key": scoring.get("has_api_key"),
        },
    }


@app.get("/admin/history")
async def admin_history(limit: int = 200, user: dict = Depends(require_admin)):
    """Get cross-user history for admin calls/reporting."""
    rows = [_public_result(item) for item in _all_history_entries()[:limit]]
    return {"results": rows, "total": len(rows)}


@app.get("/admin/scoring-logs")
async def admin_scoring_logs(limit: int = 100, user: dict = Depends(require_admin)):
    """Get scoring logs for monitoring."""
    return admin_db.get_scoring_logs(limit=limit)


@app.get("/admin/system-logs")
async def admin_system_logs(limit: int = 100, user: dict = Depends(require_admin)):
    """Get system logs for monitoring."""
    return admin_db.get_system_logs(limit=limit)


@app.get("/admin/api-usage")
async def admin_api_usage(user: dict = Depends(require_admin)):
    """Return API usage counters and token usage."""
    return admin_db.get_api_usage_summary()


@app.get("/admin/monitoring/table")
async def admin_monitoring_table(limit: int = 120, user: dict = Depends(require_admin)):
    """Merged table of requests, scoring logs, and errors."""
    return {
        "rows": admin_db.get_monitoring_table(limit=limit),
        "request_count": len(admin_db.request_logs),
        "tokens_used": admin_db.tokens_used_total,
    }


@app.get("/admin/users/list")
async def admin_users_list(user: dict = Depends(require_admin)):
    """List all users and metadata for user management."""
    return {"users": list_auth_users()}


@app.post("/admin/users")
async def admin_users_create(body: AdminCreateUserBody, user: dict = Depends(require_admin)):
    """Admin creates a new user with selected role."""
    result = add_user_by_admin(body.username, body.password, body.role)
    status_code = 201 if result.get("success") else 400
    return JSONResponse(status_code=status_code, content=result)


@app.delete("/admin/users/{user_id}")
async def admin_users_delete(user_id: str, user: dict = Depends(require_admin)):
    """Admin deletes a user."""
    result = delete_auth_user(user_id, actor_user_id=user.get("user_id"))
    status_code = 200 if result.get("success") else 400
    return JSONResponse(status_code=status_code, content=result)


@app.post("/admin/users/{user_id}/block")
async def admin_users_block(user_id: str, user: dict = Depends(require_admin)):
    """Admin blocks user login access."""
    result = block_auth_user(user_id)
    status_code = 200 if result.get("success") else 404
    return JSONResponse(status_code=status_code, content=result)


@app.post("/admin/users/{user_id}/unblock")
async def admin_users_unblock(user_id: str, user: dict = Depends(require_admin)):
    """Admin unblocks user login access."""
    result = unblock_auth_user(user_id)
    status_code = 200 if result.get("success") else 404
    return JSONResponse(status_code=status_code, content=result)


@app.put("/admin/users/{user_id}/role")
async def admin_users_assign_role(user_id: str, body: RoleUpdateBody, user: dict = Depends(require_admin)):
    """Admin assigns user role: admin/evaluator/user."""
    result = assign_auth_role(user_id, body.role)
    status_code = 200 if result.get("success") else 400
    return JSONResponse(status_code=status_code, content=result)


@app.get("/admin/users/{user_id}/activity")
async def admin_users_activity(user_id: str, user: dict = Depends(require_admin)):
    """Admin views activity metadata for a user."""
    result = get_user_activity(user_id)
    status_code = 200 if result.get("success") else 404
    return JSONResponse(status_code=status_code, content=result)


@app.get("/admin/policy")
async def admin_policy_view(user: dict = Depends(require_admin)):
    """View active policy document content and metadata."""
    policy_path = Path(get_policy_path())
    if not policy_path.exists():
        return {
            "exists": False,
            "policy_path": str(policy_path),
            "content": "",
        }

    return {
        "exists": True,
        "policy_path": str(policy_path),
        "content": policy_path.read_text(encoding="utf-8"),
        "size_bytes": policy_path.stat().st_size,
        "updated_at": datetime.utcfromtimestamp(policy_path.stat().st_mtime).isoformat(),
    }


@app.post("/admin/policy/upload")
async def admin_policy_upload(file: UploadFile = File(...), user: dict = Depends(require_admin)):
    """Upload policy file and rebuild embeddings/vector DB."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No policy file provided")

    safe_name = _sanitize_filename(file.filename)
    target = POLICY_DIR / f"{uuid.uuid4()}_{safe_name}"

    data = await file.read()
    try:
        text = data.decode("utf-8")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Policy file must be UTF-8 text") from exc

    target.write_text(text, encoding="utf-8")
    set_policy_path(str(target))
    rebuild_info = rebuild_retriever(str(target))
    admin_db.log_system("info", "rag", "Policy uploaded", {"policy_path": str(target)})
    return {
        "success": True,
        "policy_path": str(target),
        "rebuild": rebuild_info,
    }


@app.put("/admin/policy/update")
async def admin_policy_update(body: PolicyUpdateBody, user: dict = Depends(require_admin)):
    """Update current active policy content and rebuild retriever."""
    policy_path = Path(get_policy_path())
    policy_path.parent.mkdir(parents=True, exist_ok=True)
    policy_path.write_text(body.content or "", encoding="utf-8")
    rebuild_info = rebuild_retriever(str(policy_path))
    admin_db.log_system("info", "rag", "Policy updated", {"policy_path": str(policy_path)})
    return {"success": True, "policy_path": str(policy_path), "rebuild": rebuild_info}


@app.delete("/admin/policy")
async def admin_policy_delete(user: dict = Depends(require_admin)):
    """Delete active policy file and reset to empty policy text."""
    policy_path = Path(get_policy_path())
    if policy_path.exists():
        policy_path.unlink()

    policy_path.write_text("", encoding="utf-8")
    rebuild_info = rebuild_retriever(str(policy_path))
    admin_db.log_system("warning", "rag", "Policy deleted/reset", {"policy_path": str(policy_path)})
    return {"success": True, "policy_path": str(policy_path), "rebuild": rebuild_info}


@app.post("/admin/policy/rebuild-embeddings")
async def admin_policy_rebuild_embeddings(user: dict = Depends(require_admin)):
    """Rebuild policy embeddings for current policy source."""
    rebuild_info = rebuild_retriever(str(get_policy_path()))
    return {"success": True, "task": "rebuild_embeddings", "rebuild": rebuild_info}


@app.post("/admin/policy/rebuild-vector-db")
async def admin_policy_rebuild_vector_db(user: dict = Depends(require_admin)):
    """Rebuild vector DB for current policy source."""
    rebuild_info = rebuild_retriever(str(get_policy_path()))
    return {"success": True, "task": "rebuild_vector_db", "rebuild": rebuild_info}


@app.get("/admin/calls")
async def admin_calls(limit: int = 300, user: dict = Depends(require_admin)):
    """Admin sees all calls across users."""
    rows = [_public_result(item) for item in _all_history_entries()[:limit]]
    return {"calls": rows, "total": len(rows)}


@app.post("/admin/calls/upload")
async def admin_calls_upload(file: UploadFile = File(...), user: dict = Depends(require_admin)):
    """Admin upload endpoint for call scoring (reuses standard processing flow)."""
    return await process_call(file=file, user=user)


@app.delete("/admin/calls/{result_id}")
async def admin_calls_delete(result_id: str, user: dict = Depends(require_admin)):
    """Delete a call and its generated artifacts."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Call not found")

    for key in ("transcript_path", "report_pdf_path"):
        p = entry.get(key)
        if p and Path(p).exists():
            try:
                Path(p).unlink()
            except OSError as cleanup_error:
                admin_db.log_error(
                    user["user_id"],
                    "ArtifactCleanupError",
                    f"Failed to delete artifact for result_id={result_id}: {p}",
                    "/admin/calls/{result_id}",
                    str(cleanup_error),
                )

    _remove_result_entry(result_id)
    admin_db.log_system("info", "calls", "Call deleted", {"result_id": result_id})
    return {"success": True, "result_id": result_id}


@app.post("/admin/calls/{result_id}/rescore")
async def admin_calls_rescore(result_id: str, user: dict = Depends(require_admin)):
    """Re-score an existing call from stored transcript."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Call not found")

    transcript_path = entry.get("transcript_path")
    if not transcript_path or not Path(transcript_path).exists():
        raise HTTPException(status_code=404, detail="Transcript not available for rescoring")

    transcript = Path(transcript_path).read_text(encoding="utf-8")
    eval_start = time.monotonic()
    result = evaluate_call_quality(transcript, verbose=False)
    duration_ms = (time.monotonic() - eval_start) * 1000

    entry["quality_score"] = round(result["quality_score"], 1)
    entry["empathy_score"] = round(result["empathy_score"], 1)
    entry["professionalism_score"] = round(result["professionalism_score"], 1)
    entry["compliance_score"] = round(result["compliance_score"], 1)
    entry["efficiency_score"] = (
        round(result["efficiency_score"], 1)
        if result.get("efficiency_score") is not None else None
    )
    entry["resolution_score"] = round(
        (entry["compliance_score"] + (entry["efficiency_score"] if entry["efficiency_score"] is not None else entry["compliance_score"])) / 2,
        1,
    )
    entry["violations"] = result.get("violations", [])
    entry["improvements"] = result.get("improvements", [])
    entry["rescored_at"] = _now_iso()

    report_path = _resolve_report_path(entry)
    if report_path.exists():
        report_path.unlink()
    _ensure_report_artifact(entry)
    _save_history_db()

    tokens_used = _estimate_tokens(transcript) + 400
    admin_db.log_scoring(
        user_id=owner_user_id,
        result_id=result_id,
        filename=entry.get("filename") or "unknown",
        quality_score=entry["quality_score"],
        empathy_score=entry["empathy_score"],
        compliance_score=entry["compliance_score"],
        efficiency_score=entry.get("efficiency_score") or 0,
        duration_ms=duration_ms,
        tokens_used=tokens_used,
    )

    return {"success": True, "result": _public_result(entry)}


@app.get("/admin/calls/{result_id}/transcript/download")
async def admin_calls_download_transcript(result_id: str, user: dict = Depends(require_admin)):
    """Admin transcript download for any call."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Call not found")

    transcript_path = entry.get("transcript_path")
    if not transcript_path or not Path(transcript_path).exists():
        raise HTTPException(status_code=404, detail="Transcript not found")

    return FileResponse(
        transcript_path,
        media_type="text/plain",
        filename=Path(transcript_path).name,
    )


@app.post("/admin/echoscore/run")
async def admin_echoscore_run(body: EchoScoreRunBody, user: dict = Depends(require_admin)):
    """Run scoring manually on provided transcript text."""
    transcript = (body.transcript or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript is required")

    target_user_id = body.user_id or user.get("user_id")
    eval_start = time.monotonic()
    result = evaluate_call_quality(transcript, verbose=False)
    elapsed = round(time.monotonic() - eval_start, 2)

    result_id = str(uuid.uuid4())
    efficiency_score = (
        round(result["efficiency_score"], 1)
        if result.get("efficiency_score") is not None else None
    )
    compliance_score = round(result["compliance_score"], 1)
    entry = {
        "id": result_id,
        "filename": body.call_name,
        "duration_seconds": 0,
        "summary": summarize_transcript(transcript),
        "quality_score": round(result["quality_score"], 1),
        "empathy_score": round(result["empathy_score"], 1),
        "professionalism_score": round(result["professionalism_score"], 1),
        "compliance_score": compliance_score,
        "resolution_score": round(
            (compliance_score + (efficiency_score if efficiency_score is not None else compliance_score)) / 2,
            1,
        ),
        "efficiency_score": efficiency_score,
        "language_detected": result.get("language_detected", "Unknown"),
        "language_proficiency_score": result.get("language_proficiency_score"),
        "bias_reduction_score": result.get("bias_reduction_score"),
        "customer_emotion": result.get("customer_emotion", "Unknown"),
        "sales_opportunity_score": result.get("sales_opportunity_score"),
        "time_taken_seconds": elapsed,
        "violations": result.get("violations", []),
        "improvements": result.get("improvements", []),
        "timestamp": _now_iso(),
        "user_id": target_user_id,
        "manual_run": True,
    }

    entry["transcript_path"] = _save_transcript_artifact(entry, transcript)
    if target_user_id not in CALL_HISTORY_DB:
        CALL_HISTORY_DB[target_user_id] = []
    CALL_HISTORY_DB[target_user_id].insert(0, entry)
    CALL_HISTORY_DB[target_user_id] = CALL_HISTORY_DB[target_user_id][:200]
    _save_history_db()

    tokens_used = _estimate_tokens(transcript) + 400
    admin_db.log_scoring(
        user_id=target_user_id,
        result_id=result_id,
        filename=entry.get("filename") or "manual_call.txt",
        quality_score=entry["quality_score"],
        empathy_score=entry["empathy_score"],
        compliance_score=entry["compliance_score"],
        efficiency_score=entry.get("efficiency_score") or 0,
        duration_ms=elapsed * 1000,
        tokens_used=tokens_used,
    )

    return {"success": True, "result": _public_result(entry)}


@app.get("/admin/echoscore/scores")
async def admin_echoscore_scores(limit: int = 300, user: dict = Depends(require_admin)):
    """View scores across all calls."""
    rows = _all_history_entries()[:limit]
    scores = [
        {
            "id": r.get("id"),
            "user_id": r.get("user_id"),
            "filename": r.get("filename"),
            "quality_score": r.get("quality_score"),
            "empathy_score": r.get("empathy_score"),
            "compliance_score": r.get("compliance_score"),
            "efficiency_score": r.get("efficiency_score"),
            "timestamp": r.get("timestamp"),
        }
        for r in rows
    ]
    return {"scores": scores, "total": len(scores)}


@app.get("/admin/echoscore/parameters")
async def admin_echoscore_parameters(user: dict = Depends(require_admin)):
    """View current scoring parameters."""
    return get_scoring_parameters()


@app.put("/admin/echoscore/parameters")
async def admin_echoscore_parameters_update(body: EchoScoreParamsBody, user: dict = Depends(require_admin)):
    """Edit scoring parameters and model settings."""
    payload = body.model_dump(exclude_none=True)
    try:
        updated = update_scoring_parameters(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid scoring parameters: {exc}") from exc

    SYSTEM_SETTINGS["model"] = updated.get("openrouter_model")
    SYSTEM_SETTINGS["api_key_set"] = updated.get("has_api_key", SYSTEM_SETTINGS["api_key_set"])
    SYSTEM_SETTINGS["scoring_rules"] = {
        "final_weights": updated.get("final_weights", {}),
        "empathy_weights": updated.get("empathy_weights", {}),
        "professionalism_weights": updated.get("professionalism_weights", {}),
        "compliance_weights": updated.get("compliance_weights", {}),
    }
    return {"success": True, "parameters": updated}


@app.post("/admin/echoscore/parameters/reset")
async def admin_echoscore_parameters_reset(user: dict = Depends(require_admin)):
    """Reset scoring parameters to defaults."""
    params = reset_scoring_parameters()
    SYSTEM_SETTINGS["model"] = params.get("openrouter_model")
    return {"success": True, "parameters": params}


@app.post("/admin/echoscore/{result_id}/reset")
async def admin_echoscore_reset_score(result_id: str, user: dict = Depends(require_admin)):
    """Reset score values for a specific result."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Result not found")

    for key in (
        "quality_score",
        "empathy_score",
        "professionalism_score",
        "compliance_score",
        "resolution_score",
        "efficiency_score",
    ):
        entry[key] = 0
    entry["violations"] = []
    entry["improvements"] = []
    entry["score_reset_at"] = _now_iso()
    _save_history_db()
    return {"success": True, "result": _public_result(entry)}


@app.get("/admin/echoscore/{result_id}/details")
async def admin_echoscore_details(result_id: str, user: dict = Depends(require_admin)):
    """View full evaluation details for a specific call."""
    owner_user_id, entry = _find_result_entry(result_id)
    if not entry or not owner_user_id:
        raise HTTPException(status_code=404, detail="Result not found")
    return _public_result(entry)


@app.get("/admin/reports/analytics")
async def admin_reports_analytics(
    user_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    min_score: Optional[float] = Query(default=None),
    max_score: Optional[float] = Query(default=None),
    user: dict = Depends(require_admin),
):
    """Get report analytics with filters by user/date/score."""
    rows = _all_history_entries()
    filtered = _filter_rows(rows, user_id=user_id, start_date=start_date, end_date=end_date, min_score=min_score, max_score=max_score)
    summary = _analytics_summary(filtered)
    return {
        "filters": {
            "user_id": user_id,
            "start_date": start_date,
            "end_date": end_date,
            "min_score": min_score,
            "max_score": max_score,
        },
        "summary": summary,
        "results": [_public_result(item) for item in filtered],
        "total": len(filtered),
    }


@app.post("/admin/reports/generate")
async def admin_reports_generate(
    user_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    min_score: Optional[float] = Query(default=None),
    max_score: Optional[float] = Query(default=None),
    user: dict = Depends(require_admin),
):
    """Generate a report payload and summary for current filters."""
    rows = _all_history_entries()
    filtered = _filter_rows(rows, user_id=user_id, start_date=start_date, end_date=end_date, min_score=min_score, max_score=max_score)
    summary = _analytics_summary(filtered)
    return {
        "success": True,
        "summary": summary,
        "total": len(filtered),
        "generated_at": _now_iso(),
    }


@app.get("/admin/reports/export/pdf")
async def admin_reports_export_pdf(
    user_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    min_score: Optional[float] = Query(default=None),
    max_score: Optional[float] = Query(default=None),
    user: dict = Depends(require_admin),
):
    """Export filtered analytics report as PDF."""
    rows = _all_history_entries()
    filtered = _filter_rows(rows, user_id=user_id, start_date=start_date, end_date=end_date, min_score=min_score, max_score=max_score)
    summary = _analytics_summary(filtered)
    report_name = f"analytics_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    output_path = REPORTS_DIR / report_name
    generate_analytics_report_pdf(filtered, summary, str(output_path))
    return FileResponse(
        str(output_path),
        media_type="application/pdf",
        filename=report_name,
    )


@app.get("/admin/reports/export/csv")
async def admin_reports_export_csv(
    user_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    min_score: Optional[float] = Query(default=None),
    max_score: Optional[float] = Query(default=None),
    user: dict = Depends(require_admin),
):
    """Export filtered analytics report as CSV."""
    rows = _all_history_entries()
    filtered = _filter_rows(rows, user_id=user_id, start_date=start_date, end_date=end_date, min_score=min_score, max_score=max_score)
    report_name = f"analytics_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    output_path = REPORTS_DIR / report_name
    generate_analytics_csv(filtered, str(output_path))
    return FileResponse(
        str(output_path),
        media_type="text/csv",
        filename=report_name,
    )


@app.get("/admin/settings")
async def admin_settings(user: dict = Depends(require_admin)):
    """Get system settings for admin controls."""
    return {
        "model": SYSTEM_SETTINGS.get("model"),
        "api_key_set": SYSTEM_SETTINGS.get("api_key_set"),
        "scoring_rules": SYSTEM_SETTINGS.get("scoring_rules", {}),
        "feature_flags": SYSTEM_SETTINGS.get("feature_flags", {}),
        "scoring_parameters": get_scoring_parameters(),
    }


@app.put("/admin/settings")
async def admin_settings_update(body: SettingsUpdateBody, user: dict = Depends(require_admin)):
    """Update API/model/scoring/feature settings."""
    payload = body.model_dump(exclude_none=True)

    if "model" in payload:
        SYSTEM_SETTINGS["model"] = payload["model"]
        update_scoring_parameters({"openrouter_model": payload["model"]})

    if "api_key" in payload:
        if payload["api_key"]:
            SYSTEM_SETTINGS["api_key_set"] = True
            update_scoring_parameters({"openrouter_api_key": payload["api_key"]})

    if "scoring_rules" in payload and isinstance(payload["scoring_rules"], dict):
        SYSTEM_SETTINGS["scoring_rules"] = payload["scoring_rules"]
        scoring_updates = {}
        for key in ("final_weights", "empathy_weights", "professionalism_weights", "compliance_weights"):
            value = payload["scoring_rules"].get(key)
            if isinstance(value, dict):
                scoring_updates[key] = value
        if scoring_updates:
            update_scoring_parameters(scoring_updates)

    if "feature_flags" in payload and isinstance(payload["feature_flags"], dict):
        flags = SYSTEM_SETTINGS.get("feature_flags", {})
        flags.update(payload["feature_flags"])
        SYSTEM_SETTINGS["feature_flags"] = flags

    admin_db.log_system("info", "settings", "System settings updated", {"updated_keys": list(payload.keys())})
    return {
        "success": True,
        "settings": {
            "model": SYSTEM_SETTINGS.get("model"),
            "api_key_set": SYSTEM_SETTINGS.get("api_key_set"),
            "scoring_rules": SYSTEM_SETTINGS.get("scoring_rules", {}),
            "feature_flags": SYSTEM_SETTINGS.get("feature_flags", {}),
        },
    }


@app.get("/admin/security")
async def admin_security(user: dict = Depends(require_admin)):
    """Role-based security overview for admin pages and routes."""
    return {
        "jwt_role_check": True,
        "admin_only_pages": [
            "/admin",
            "/admin/users",
            "/admin/policy",
            "/admin/logs",
            "/admin/settings",
        ],
        "roles": ["admin", "evaluator", "user"],
        "users": [
            {
                "user_id": item.get("user_id"),
                "role": item.get("role"),
                "blocked": item.get("blocked"),
            }
            for item in list_auth_users()
        ],
    }


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
                "evaluate": "POST /process-call (requires auth)",
                "history": "GET /history",
                "result_pdf": "GET /result/{id}/report/pdf",
                "result_transcript": "GET /result/{id}/transcript/download"
            },
            "admin": {
                "overview": "GET /admin",
                "stats": "GET /admin/stats (admin only)",
                "logs": "GET /admin/logs (admin only)",
                "errors": "GET /admin/errors (admin only)",
                "users": "GET/POST /admin/users (admin only)",
                "policy": "GET/POST/PUT/DELETE /admin/policy* (admin only)",
                "calls": "GET /admin/calls (admin only)",
                "echoscore": "GET/PUT /admin/echoscore/* (admin only)",
                "reports": "GET /admin/reports/* (admin only)",
                "settings": "GET/PUT /admin/settings (admin only)",
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
            "protected": ["/profile", "/process-call", "/history", "/result/{id}", "/result/{id}/report/pdf"],
            "admin_only": [
                "/admin",
                "/admin/users",
                "/admin/policy",
                "/admin/calls",
                "/admin/echoscore",
                "/admin/reports",
                "/admin/logs",
                "/admin/settings"
            ]
        }
    }




# ============================================================================
# PROFILE ROUTES — Authenticated Users
# ============================================================================

@app.put("/profile/display-name")
async def update_display_name(body: UpdateDisplayNameBody, user: dict = Depends(get_current_user)):
    """Update the current user's display name."""
    user_id = user["user_id"]
    display_name = (body.display_name or "").strip()
    if not display_name or len(display_name) < 2:
        raise HTTPException(status_code=400, detail="Display name must be at least 2 characters")
    if len(display_name) > 60:
        raise HTTPException(status_code=400, detail="Display name must be 60 characters or less")
    from mongo_auth_db import get_users_collection
    get_users_collection().update_one({"user_id": user_id}, {"$set": {"display_name": display_name}})
    record_user_activity(user_id)
    return {"success": True, "display_name": display_name}


@app.put("/profile/organization")
async def update_organization(body: UpdateOrganizationBody, user: dict = Depends(get_current_user)):
    """Update the current user's organization name."""
    user_id = user["user_id"]
    org = (body.organization or "").strip()
    from mongo_auth_db import get_users_collection
    get_users_collection().update_one({"user_id": user_id}, {"$set": {"organization": org}})
    record_user_activity(user_id)
    return {"success": True, "organization": org}


@app.post("/profile/change-password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    """Change password — verifies current password, then hashes and stores new one."""
    from auth import hash_password, verify_password, get_user
    from mongo_auth_db import get_users_collection
    user_id = user["user_id"]
    db_user = get_user(user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(body.current_password, db_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    new_hash = hash_password(body.new_password)
    get_users_collection().update_one({"user_id": user_id}, {"$set": {"password_hash": new_hash}})
    record_user_activity(user_id)
    return {"success": True, "message": "Password updated successfully"}


@app.post("/profile/picture")
async def upload_profile_picture(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload and store a profile picture. Stores relative URL; returns avatar_url."""
    user_id = user["user_id"]
    AVATAR_DIR = BASE_DIR / "secure_assets" / "avatars"
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)

    allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    ext = Path(file.filename or "avatar.jpg").suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Allowed image types: jpg, png, webp, gif")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be under 5 MB")

    safe_name = f"{user_id}{ext}"
    avatar_path = AVATAR_DIR / safe_name
    avatar_path.write_bytes(contents)
    avatar_url = f"/avatars/{safe_name}"

    from mongo_auth_db import get_users_collection
    get_users_collection().update_one({"user_id": user_id}, {"$set": {"avatar_url": avatar_url}})
    record_user_activity(user_id)
    return {"success": True, "avatar_url": avatar_url}


@app.get("/avatars/{filename}")
async def serve_avatar(filename: str):
    """Serve uploaded profile picture files."""
    AVATAR_DIR = BASE_DIR / "secure_assets" / "avatars"
    file_path = AVATAR_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(str(file_path))


@app.delete("/profile/picture")
async def remove_profile_picture(user: dict = Depends(get_current_user)):
    """Remove profile picture and revert to initials avatar."""
    user_id = user["user_id"]
    from mongo_auth_db import get_users_collection
    get_users_collection().update_one({"user_id": user_id}, {"$set": {"avatar_url": None}})
    return {"success": True, "avatar_url": None}


@app.get("/profile/sessions")
async def get_active_sessions(user: dict = Depends(get_current_user)):
    """Return list of active (non-revoked, non-expired) sessions for the current user."""
    from mongo_auth_db import get_tokens_collection
    user_id = user["user_id"]
    now = datetime.utcnow()
    cursor = get_tokens_collection().find(
        {"user_id": user_id, "revoked": False, "expires_at": {"$gt": now}},
        {"_id": 0, "jti": 1, "issued_at": 1, "expires_at": 1},
    ).sort("issued_at", -1).limit(20)
    sessions = []
    for doc in cursor:
        sessions.append({
            "session_id": doc.get("jti"),
            "issued_at": doc.get("issued_at").isoformat() if doc.get("issued_at") else None,
            "expires_at": doc.get("expires_at").isoformat() if doc.get("expires_at") else None,
        })
    return {"sessions": sessions}


@app.delete("/profile/sessions/{session_id}")
async def revoke_session(session_id: str, user: dict = Depends(get_current_user)):
    """Revoke a specific session token by its JTI."""
    from mongo_auth_db import get_tokens_collection
    user_id = user["user_id"]
    result = get_tokens_collection().update_one(
        {"jti": session_id, "user_id": user_id},
        {"$set": {"revoked": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "message": "Session revoked"}


@app.delete("/profile/sessions")
async def revoke_all_other_sessions(user: dict = Depends(get_current_user), authorization: str = Header(None)):
    """Revoke all sessions except the current one."""
    from mongo_auth_db import get_tokens_collection
    import jwt as pyjwt
    user_id = user["user_id"]
    current_jti = None
    try:
        token_str = (authorization or "").split(" ")[-1]
        payload = pyjwt.decode(token_str, options={"verify_signature": False})
        current_jti = payload.get("jti")
    except Exception:
        pass
    query = {"user_id": user_id, "revoked": False}
    if current_jti:
        query["jti"] = {"$ne": current_jti}
    get_tokens_collection().update_many(query, {"$set": {"revoked": True}})
    return {"success": True, "message": "All other sessions revoked"}


# ── TOTP 2FA Endpoints ────────────────────────────────────────────────────────

@app.post("/profile/2fa/setup")
async def setup_totp(user: dict = Depends(get_current_user)):
    """
    Generate a new TOTP secret and return the provisioning URI + QR code data.
    The secret is stored temporarily; becomes active only after /profile/2fa/verify.
    """
    try:
        import pyotp
        import qrcode
        import io
        import base64
    except ImportError:
        raise HTTPException(status_code=501, detail="pyotp / qrcode packages not installed. Run: pip install pyotp qrcode[pil]")

    from mongo_auth_db import get_users_collection
    user_id = user["user_id"]
    from auth import get_user
    db_user = get_user(user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=db_user.username, issuer_name="EchoScore")

    # Generate QR code
    qr = qrcode.make(uri)
    buf = io.BytesIO()
    qr.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    # Store pending secret (not yet active)
    get_users_collection().update_one({"user_id": user_id}, {"$set": {"totp_secret_pending": secret}})

    return {"success": True, "secret": secret, "uri": uri, "qr_code_base64": qr_b64}


@app.post("/profile/2fa/verify")
async def verify_totp_setup(body: TOTPVerifyBody, user: dict = Depends(get_current_user)):
    """Confirm TOTP setup by verifying the first code. Activates 2FA on success."""
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=501, detail="pyotp not installed")

    from mongo_auth_db import get_users_collection
    user_id = user["user_id"]
    doc = get_users_collection().find_one({"user_id": user_id}, {"totp_secret_pending": 1})
    secret = (doc or {}).get("totp_secret_pending")
    if not secret:
        raise HTTPException(status_code=400, detail="No pending TOTP setup found. Call /profile/2fa/setup first.")

    totp = pyotp.TOTP(secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code. Please try again.")

    get_users_collection().update_one(
        {"user_id": user_id},
        {"$set": {"totp_secret": secret, "totp_enabled": True}, "$unset": {"totp_secret_pending": ""}},
    )
    return {"success": True, "message": "Two-factor authentication enabled"}


@app.post("/profile/2fa/disable")
async def disable_totp(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    """Disable 2FA — requires password confirmation for security."""
    from auth import verify_password, get_user
    from mongo_auth_db import get_users_collection
    user_id = user["user_id"]
    db_user = get_user(user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(body.current_password, db_user.password_hash):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    get_users_collection().update_one(
        {"user_id": user_id},
        {"$set": {"totp_enabled": False, "totp_secret": None}},
    )
    return {"success": True, "message": "Two-factor authentication disabled"}


# ── Google OAuth ──────────────────────────────────────────────────────────────

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")


@app.get("/auth/google")
async def google_oauth_start():
    """Redirect URL for Google OAuth flow. Returns the authorization URL."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env")
    import urllib.parse
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    return {"auth_url": auth_url}


@app.get("/auth/google/callback")
async def google_oauth_callback(code: str = Query(...)):
    """
    Exchange Google auth code for profile; create or link user account.
    Returns EchoScore JWT on success.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=501, detail="httpx package not installed. Run: pip install httpx")

    from mongo_auth_db import get_users_collection
    from auth import create_token, hash_password

    async with httpx.AsyncClient() as client_http:
        # Exchange code for tokens
        token_resp = await client_http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange Google auth code")
        tokens = token_resp.json()
        access_token = tokens.get("access_token")

        # Get user info from Google
        userinfo_resp = await client_http.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get Google user info")
        google_user = userinfo_resp.json()

    google_id = google_user.get("sub")
    email = google_user.get("email", "")
    name = google_user.get("name", "")
    avatar = google_user.get("picture", "")
    given_name = google_user.get("given_name", email.split("@")[0])

    users_col = get_users_collection()

    # Try to find existing user by google_id or email-derived username
    existing = users_col.find_one({"$or": [{"google_id": google_id}, {"username": given_name}]})

    if existing:
        user_id = existing["user_id"]
        users_col.update_one(
            {"user_id": user_id},
            {"$set": {"google_id": google_id, "avatar_url": avatar, "display_name": name, "last_login": _now_iso()}},
        )
    else:
        # Create new user from Google profile
        user_id = given_name
        now = _now_iso()
        user_doc = {
            "user_id": user_id,
            "username": given_name,
            "password_hash": hash_password(str(uuid.uuid4())),  # random unusable password
            "role": "user",
            "created_at": now,
            "blocked": False,
            "last_login": now,
            "last_activity": now,
            "display_name": name,
            "google_id": google_id,
            "avatar_url": avatar,
            "organization": None,
            "totp_enabled": False,
            "totp_secret": None,
        }
        try:
            users_col.insert_one(user_doc)
        except Exception:
            user_id = f"{given_name}_{google_id[-6:]}"
            user_doc["user_id"] = user_id
            user_doc["username"] = user_id
            users_col.insert_one(user_doc)

    db_user = users_col.find_one({"user_id": user_id})
    token = create_token(user_id, db_user.get("role", "user"))
    return {
        "success": True,
        "token": token,
        "user_id": user_id,
        "username": db_user.get("username"),
        "display_name": db_user.get("display_name"),
        "avatar_url": db_user.get("avatar_url"),
        "role": db_user.get("role", "user"),
    }


# ============================================================================
# PER-USER POLICY ROUTES
# ============================================================================

USER_POLICIES_DB: Dict[str, List[dict]] = {}
USER_POLICY_DIR = BASE_DIR / "user_policy_files"
USER_POLICY_DIR.mkdir(exist_ok=True)


@app.get("/user-policies")
async def list_user_policies(user: dict = Depends(get_current_user)):
    """List all policies uploaded by the current user."""
    user_id = user["user_id"]
    return {"policies": USER_POLICIES_DB.get(user_id, [])}


@app.post("/user-policies/upload")
async def upload_user_policy(
    file: UploadFile = File(...),
    policy_type: str = "general",
    user: dict = Depends(get_current_user),
):
    """Upload a policy file (PDF/DOCX/TXT). Stored per user, isolated from other users."""
    user_id = user["user_id"]
    allowed = {".txt", ".pdf", ".docx", ".md"}
    ext = Path(file.filename or "policy.txt").suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Allowed policy types: txt, pdf, docx, md")

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Policy file must be under 20 MB")

    policy_id = str(uuid.uuid4())
    user_dir = USER_POLICY_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    file_path = user_dir / f"{policy_id}{ext}"
    file_path.write_bytes(contents)

    # Extract text for chunk count estimate
    try:
        policy_text = extract_text_from_file(str(file_path))
        chunk_count = max(1, len(policy_text) // 300)
    except Exception:
        policy_text = ""
        chunk_count = 0

    record = {
        "id": policy_id,
        "user_id": user_id,
        "filename": file.filename,
        "policy_type": policy_type,
        "uploaded_at": _now_iso(),
        "file_path": str(file_path),
        "chunk_count": chunk_count,
        "is_active": True,
        "version": 1,
    }

    if user_id not in USER_POLICIES_DB:
        USER_POLICIES_DB[user_id] = []
    USER_POLICIES_DB[user_id].insert(0, record)

    record_user_activity(user_id)
    return {
        "success": True,
        "policy": {k: v for k, v in record.items() if k != "file_path"},
    }


@app.delete("/user-policies/{policy_id}")
async def delete_user_policy(policy_id: str, user: dict = Depends(get_current_user)):
    """Delete one of the current user's uploaded policies."""
    user_id = user["user_id"]
    policies = USER_POLICIES_DB.get(user_id, [])
    target = next((p for p in policies if p["id"] == policy_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Policy not found")

    # Remove file
    try:
        Path(target["file_path"]).unlink(missing_ok=True)
    except Exception:
        pass

    USER_POLICIES_DB[user_id] = [p for p in policies if p["id"] != policy_id]
    return {"success": True, "message": "Policy deleted"}


@app.get("/user-policies/{policy_id}")
async def get_user_policy_detail(policy_id: str, user: dict = Depends(get_current_user)):
    """Get details of a specific policy."""
    user_id = user["user_id"]
    policies = USER_POLICIES_DB.get(user_id, [])
    target = next((p for p in policies if p["id"] == policy_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Policy not found")
    return {k: v for k, v in target.items() if k != "file_path"}


@app.post("/user-policies/{policy_id}/reprocess")
async def reprocess_user_policy(policy_id: str, user: dict = Depends(get_current_user)):
    """Re-extract text and update chunk count for a policy."""
    user_id = user["user_id"]
    policies = USER_POLICIES_DB.get(user_id, [])
    target = next((p for p in policies if p["id"] == policy_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Policy not found")
    try:
        policy_text = extract_text_from_file(target["file_path"])
        chunk_count = max(1, len(policy_text) // 300)
        target["chunk_count"] = chunk_count
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reprocessing failed: {e}")
    return {"success": True, "chunk_count": chunk_count}


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
