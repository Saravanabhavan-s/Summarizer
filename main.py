"""
FastAPI Backend for Call Quality Scoring System
Integrates with the call_quality_scorer module
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import time
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from call_quality_scorer import evaluate_call_quality
from utils.text_parser import extract_text_from_file
from transcriber import transcribe_audio, summarize_transcript

# File-type classification
AUDIO_EXTENSIONS = {'.mp3', '.wav', '.m4a', '.mp4', '.flac', '.ogg', '.wma', '.aac'}
TEXT_EXTENSIONS  = {'.txt', '.pdf', '.docx'}
ALLOWED_EXTENSIONS = AUDIO_EXTENSIONS | TEXT_EXTENSIONS

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Call Quality Scorer API",
    description="Real-time call quality analysis with hybrid rule-based and LLM evaluation",
    version="1.0.0"
)

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


@app.get("/health")
async def health_check():
    """
    Health check endpoint
    Returns: {"status": "ok", "service": "call_quality_scorer"}
    """
    return {
        "status": "ok",
        "service": "call_quality_scorer",
        "version": "1.0.0"
    }


@app.post("/process-call")
async def process_call(file: UploadFile = File(...)):
    """
    Process audio file and return quality scores
    
    Args:
        file: Audio file (MP3, WAV, M4A, FLAC, OGG, etc.)
    
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
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}. "
                f"Got: {file.filename}"
            ),
        )

    # Validate file size (100 MB max)
    max_size = 100 * 1024 * 1024

    temp_path = None
    try:
        # Save uploaded bytes to a temp file with the original extension
        contents = await file.read()
        if len(contents) > max_size:
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
        eval_start = time.monotonic()

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
        response = {
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
        
        return JSONResponse(status_code=200, content=response)
        
    except HTTPException:
        raise
    except Exception as e:
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


@app.get("/")
async def root():
    """
    Root endpoint with API information
    """
    return {
        "service": "Call Quality Scorer API",
        "version": "1.0.0",
        "documentation": "/docs",
        "endpoints": {
            "health": "/health",
            "process_call": "/process-call"
        }
    }


@app.get("/docs-summary")
async def docs_summary():
    """
    Simple documentation summary
    """
    return {
        "title": "Call Quality Scorer API",
        "description": "Real-time call quality analysis with hybrid rule-based and LLM evaluation",
        "endpoints": [
            {
                "path": "/health",
                "method": "GET",
                "description": "Health check endpoint",
                "response": {"status": "ok"}
            },
            {
                "path": "/process-call",
                "method": "POST",
                "description": "Process audio file and return quality scores",
                "parameters": {
                    "file": "Audio file (MP3, WAV, M4A, max 100MB)"
                },
                "response": {
                    "filename": "string",
                    "duration_seconds": "integer",
                    "summary": "string",
                    "quality_score": "float (0-100)",
                    "empathy_score": "float (0-100)",
                    "professionalism_score": "float (0-100)",
                    "compliance_score": "float (0-100)",
                    "violations": "array of strings",
                    "improvements": "array of strings"
                }
            }
        ]
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
