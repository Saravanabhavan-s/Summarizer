"""
Live Transcription Router — chunk-based LLM scoring for live playback
New standalone router: does NOT modify existing main.py endpoints.
"""

import os
import tempfile
import math
import logging
from typing import Any, Dict, List
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from call_quality_scorer import evaluate_call_quality
from transcriber import transcribe_audio
from auth import get_current_user

AUDIO_EXTENSIONS = {'.mp3', '.wav', '.m4a', '.mp4', '.flac', '.ogg', '.wma', '.aac'}

live_router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class ChunkScoreRequest(BaseModel):
    text: str
    chunk_index: int = 0
    time_start: float = 0.0
    time_end: float = 10.0


class ChunkScoreResponse(BaseModel):
    fluency: float
    confidence: float
    clarity: float
    sentiment: str
    engagement: float
    score: float
    alerts: List[str]


# ---------------------------------------------------------------------------
# POST /api/live-transcribe  — upload audio → full transcript + chunks
# ---------------------------------------------------------------------------

@live_router.post("/api/live-transcribe")
async def live_transcribe(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """
    Accept an audio file, transcribe it via Deepgram, and return the full
    transcript split into 10-second chunks with time ranges.
    """
    filename_lower = (file.filename or "").lower()
    file_ext = Path(filename_lower).suffix

    is_audio = file_ext in AUDIO_EXTENSIONS
    if not is_audio:
        content_type = file.content_type or ""
        if not (content_type.startswith("audio/") or "audio" in content_type.lower()):
            raise HTTPException(status_code=400, detail="Only audio files are supported for live transcription.")

    # Save to temp file
    temp_path = None
    try:
        contents = await file.read()
        if len(contents) > 100 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large (max 100 MB)")

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=file_ext or ".tmp")
        tmp.write(contents)
        tmp.close()
        temp_path = tmp.name

        # Transcribe via Deepgram
        transcription = transcribe_audio(temp_path)
        transcript = transcription["transcript"]
        duration_seconds = transcription["duration_seconds"]

        if not transcript.strip():
            raise HTTPException(status_code=400, detail="Transcription returned empty text.")

        # Split transcript into 10-second chunks
        chunk_duration = 10
        num_chunks = max(1, math.ceil(duration_seconds / chunk_duration)) if duration_seconds > 0 else 1

        words = transcript.split()
        words_per_chunk = max(1, len(words) // num_chunks) if num_chunks > 0 else len(words)

        chunks = []
        for i in range(num_chunks):
            start_idx = i * words_per_chunk
            end_idx = start_idx + words_per_chunk if i < num_chunks - 1 else len(words)
            chunk_text = " ".join(words[start_idx:end_idx])
            if not chunk_text.strip():
                continue
            chunks.append({
                "index": i,
                "time_start": i * chunk_duration,
                "time_end": min((i + 1) * chunk_duration, duration_seconds),
                "text": chunk_text,
            })

        return JSONResponse(content={
            "success": True,
            "transcript": transcript,
            "duration_seconds": duration_seconds,
            "chunks": chunks,
            "total_chunks": len(chunks),
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError as cleanup_error:
                logger.warning(
                    "Failed to delete temp live transcription file %s: %s",
                    temp_path,
                    cleanup_error,
                )


# ---------------------------------------------------------------------------
# POST /api/live-chunk-score  — score a single chunk via LLM
# ---------------------------------------------------------------------------

@live_router.post("/api/live-chunk-score")
async def live_chunk_score(body: ChunkScoreRequest, user: dict = Depends(get_current_user)):
    """
    Score a single transcript chunk by reusing the existing
    call_quality_scorer pipeline and prompt format.
    """
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Chunk text is empty")

    try:
        scored = evaluate_call_quality(body.text, verbose=False)
        payload = _map_call_quality_to_live_metrics(scored)
        return JSONResponse(content=payload)
    except Exception as exc:
        logger.warning(
            "Live chunk scoring failed for chunk %s: %s",
            body.chunk_index,
            exc,
        )
        return JSONResponse(content=_neutral_chunk_score())


def _score_100(value: Any, fallback: float = 50.0) -> float:
    """Coerce any numeric-ish value into a 0-100 float."""
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = float(fallback)

    return round(max(0.0, min(100.0, numeric)), 1)


def _emotion_to_sentiment(emotion: Any) -> str:
    token = str(emotion or "").strip().lower()
    if token in {"happy", "satisfied", "grateful", "positive"}:
        return "positive"
    if token in {"angry", "frustrated", "upset", "negative"}:
        return "negative"
    return "neutral"


def _collect_alerts(result: Dict[str, Any]) -> List[str]:
    alerts: List[str] = []
    for field in ("violations", "improvements"):
        for item in result.get(field) or []:
            text = str(item).strip()
            if text and text not in alerts:
                alerts.append(text)

    if not alerts:
        alerts.append("No major issues detected in this segment")

    return alerts[:8]


def _map_call_quality_to_live_metrics(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Map the existing call-quality output into live chunk metrics.
    This keeps scoring logic centralized in call_quality_scorer.
    """
    confidence = _score_100(result.get("professionalism_score"), fallback=50.0)
    engagement = _score_100(result.get("empathy_score"), fallback=50.0)
    clarity = _score_100(result.get("efficiency_score"), fallback=result.get("compliance_score", 50.0))
    fluency = _score_100(result.get("language_proficiency_score"), fallback=confidence)
    overall = _score_100(
        result.get("quality_score"),
        fallback=(fluency + confidence + clarity + engagement) / 4,
    )

    return {
        "fluency": fluency,
        "confidence": confidence,
        "clarity": clarity,
        "sentiment": _emotion_to_sentiment(result.get("customer_emotion")),
        "engagement": engagement,
        "score": overall,
        "alerts": _collect_alerts(result),
    }


def _neutral_chunk_score() -> Dict[str, Any]:
    return {
        "fluency": 50.0,
        "confidence": 50.0,
        "clarity": 50.0,
        "sentiment": "neutral",
        "engagement": 50.0,
        "score": 50.0,
        "alerts": ["Chunk scoring unavailable - neutral fallback used"],
    }
