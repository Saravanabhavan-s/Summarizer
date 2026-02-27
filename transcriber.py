"""
Integrated Call Transcription + Quality Scoring Pipeline
Transcribe → Summarize → Hybrid Quality Score → Export JSON
"""

import sys
import os
from pathlib import Path
from dotenv import load_dotenv
from deepgram import DeepgramClient, PrerecordedOptions
from openai import OpenAI
from call_quality_scorer import evaluate_call_quality
import json
from datetime import datetime

# ======================================================================
# Environment Setup
# ======================================================================

load_dotenv()

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = "openai/gpt-4o-mini"

if not DEEPGRAM_API_KEY:
    raise ValueError("DEEPGRAM_API_KEY not found in .env")

if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY not found in .env")

# Initialize OpenRouter client once
llm_client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

# ======================================================================
# Summary Prompt
# ======================================================================

SUMMARY_PROMPT = """
You are a professional call-log analyst.

Summarise the provided call transcript in EXACTLY two sentences:
- Sentence 1: Core purpose of the call and key outcome.
- Sentence 2: Important action items or next steps.

Rules:
- Be factual.
- No extra commentary.
- Each sentence under 40 words.
""".strip()

# ======================================================================
# Transcription
# ======================================================================

def transcribe_audio(file_path: str) -> dict:
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    print(f"[1/4] Transcribing: {path.name} ...")

    dg = DeepgramClient(DEEPGRAM_API_KEY)

    with open(path, "rb") as f:
        audio_bytes = f.read()

    options = PrerecordedOptions(
        model="nova-2",
        language="en",
        punctuate=True,
        diarize=True,
        smart_format=True,
    )

    response = dg.listen.prerecorded.v("1").transcribe_file(
        {"buffer": audio_bytes, "mimetype": "audio/mp4"},
        options,
    )

    # Correct object-style access
    transcript = response.results.channels[0].alternatives[0].transcript

    # Safe duration extraction
    duration = 0
    try:
        duration = int(response.metadata.duration)
    except Exception:
        duration = 0

    if not transcript.strip():
        raise ValueError("Deepgram returned empty transcript.")

    print(f"    ✓ Transcript length: {len(transcript)} characters")
    print(f"    ✓ Duration: {duration} seconds")

    return {
        "transcript": transcript,
        "duration_seconds": duration
    }

# ======================================================================
# Summarization
# ======================================================================

def summarize_transcript(transcript: str) -> str:
    print("[2/4] Generating summary ...")

    response = llm_client.chat.completions.create(
        model=OPENROUTER_MODEL,
        messages=[
            {"role": "system", "content": SUMMARY_PROMPT},
            {"role": "user", "content": transcript},
        ],
        temperature=0.3,
        max_tokens=120,
    )

    summary = response.choices[0].message.content.strip()
    print("    ✓ Summary generated")

    return summary

# ======================================================================
# Full Processing Pipeline
# ======================================================================

def process_call(audio_path: str) -> dict:

    print("\n" + "=" * 70)
    print("CALL PROCESSING PIPELINE")
    print("=" * 70)

    # Step 1: Transcribe
    transcription = transcribe_audio(audio_path)
    transcript = transcription["transcript"]
    duration = transcription["duration_seconds"]

    # Step 2: Summarize
    summary = summarize_transcript(transcript)

    # Step 3: Quality Scoring
    print("[3/4] Evaluating call quality ...\n")
    quality = evaluate_call_quality(transcript, verbose=True)

    # Step 4: Compile final report
    print("[4/4] Compiling report ...")

    result = {
        "filename": Path(audio_path).name,
        "duration_seconds": duration,
        "summary": summary,
        "quality_score": quality["quality_score"],
        "empathy_score": quality["empathy_score"],
        "professionalism_score": quality["professionalism_score"],
        "compliance_score": quality["compliance_score"],
        "violations": quality["violations"],
        "improvements": quality["improvements"],
        "transcript": transcript
    }

    return result

# ======================================================================
# Report Printing
# ======================================================================

def print_final_report(result: dict):

    print("\n" + "━" * 70)
    print("📞 CALL QUALITY REPORT")
    print("━" * 70)

    print(f"\nFile: {result['filename']}")
    print(f"Duration: {result['duration_seconds']} sec")

    # Summary
    print("\n📝 CALL SUMMARY:")
    print(result["summary"])

    # Transcript Preview
    print("\n📄 TRANSCRIPT PREVIEW:")
    transcript_preview = result["transcript"][:500]
    if len(result["transcript"]) > 500:
        transcript_preview += "..."
    print(transcript_preview)

    # Quality Score
    print(f"\n📊 Overall Quality Score: {result['quality_score']} / 100")

    print("\nBreakdown:")
    print(f"• Empathy: {result['empathy_score']}")
    print(f"• Professionalism: {result['professionalism_score']}")
    print(f"• Compliance: {result['compliance_score']}")

    if result["violations"]:
        print("\n⚠️ Key Issues:")
        for i, v in enumerate(result["violations"], 1):
            print(f"{i}. {v}")

    if result["improvements"]:
        print("\n💡 Recommended Improvements:")
        for imp in result["improvements"]:
            print(f"• {imp}")

    print("━" * 70)

# ======================================================================
# Export JSON
# ======================================================================

def export_report(result: dict):

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"call_report_{timestamp}.json"

    with open(filename, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n✅ Report exported: {filename}")

# ======================================================================
# Main
# ======================================================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python transcriber.py <audio_file.m4a>")
        sys.exit(1)

    audio_path = sys.argv[1]

    try:
        result = process_call(audio_path)
        print_final_report(result)
        export_report(result)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()