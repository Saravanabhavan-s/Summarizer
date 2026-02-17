"""
transcribe_and_summarize.py
─────────────────────────────────────────────────────────────────────────────
Pipeline:
  1. Ingest an .m4a call-log file
  2. Transcribe it via Deepgram Nova-2
  3. Send transcript to an LLM via OpenRouter
  4. Print a clean two-line summary

Install deps:
  pip install deepgram-sdk openai
"""

import sys
from pathlib import Path
from deepgram import DeepgramClient, PrerecordedOptions
from openai import OpenAI

# =============================================================================
#  🔑 API KEY PLACEHOLDERS — replace before running
# =============================================================================

DEEPGRAM_API_KEY   = "4cf44a90f6ca4a95aa791dd13a476a4b923fab85"    # e.g. "abc123..."
OPENROUTER_API_KEY = "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"  # e.g. "sk-or-..."

# =============================================================================
#  Model configuration (change freely)
# =============================================================================

DEEPGRAM_MODEL   = "nova-2"
OPENROUTER_MODEL = "openai/gpt-4o-mini"      # any model on openrouter.ai
OPENROUTER_BASE  = "https://openrouter.ai/api/v1"

# =============================================================================
#  System prompt for the summarisation step
# =============================================================================

SYSTEM_PROMPT = """
You are a professional call-log analyst with expertise in distilling conversations
into crisp, actionable intelligence.

TASK
────
Summarise the provided call transcript in EXACTLY two sentences:
  Sentence 1 – State the core topic or purpose of the call and the key outcome
               or decision reached.
  Sentence 2 – Highlight the most important action item(s) or next steps agreed
               upon by the participants.

RULES
─────
- Be factual and objective; do not add opinions or inferences.
- Use plain business English; avoid jargon unless it appeared in the transcript.
- Keep each sentence under 40 words.
- Output ONLY the two sentences — no bullets, no labels, no extra commentary.
""".strip()

# =============================================================================
#  Step 1 — Transcribe .m4a with Deepgram
# =============================================================================

def transcribe_audio(file_path: str) -> str:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    print(f"[1/3] Transcribing: {path.name} ...")

    dg = DeepgramClient(DEEPGRAM_API_KEY)

    with open(path, "rb") as f:
        audio_bytes = f.read()

    options = PrerecordedOptions(
        model=DEEPGRAM_MODEL,
        language="en",
        punctuate=True,      # add punctuation
        diarize=True,        # label speakers where possible
        smart_format=True,   # normalise numbers, dates, etc.
    )

    response = dg.listen.prerecorded.v("1").transcribe_file(
        {"buffer": audio_bytes, "mimetype": "audio/mp4"},
        options,
    )

    transcript = (
        response["results"]["channels"][0]["alternatives"][0]["transcript"]
    )

    if not transcript.strip():
        raise ValueError("Deepgram returned an empty transcript.")

    print(f"    ✓ Transcript length: {len(transcript)} characters")
    return transcript

# =============================================================================
#  Step 2 — Summarise with OpenRouter LLM
# =============================================================================

def summarize_transcript(transcript: str) -> str:
    print("[2/3] Summarising via OpenRouter ...")

    client = OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE,
    )

    response = client.chat.completions.create(
        model=OPENROUTER_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": f"Call transcript:\n\n{transcript}"},
        ],
        temperature=0.3,   # low = focused, deterministic output
        max_tokens=120,    # two concise sentences fit easily
    )

    return response.choices[0].message.content.strip()

# =============================================================================
#  Step 3 — Display results
# =============================================================================

def display_results(transcript: str, summary: str) -> None:
    sep = "─" * 64
    print(f"\n{sep}")
    print("📋  TRANSCRIPT PREVIEW  (first 400 chars)")
    print(sep)
    print(transcript[:400] + ("..." if len(transcript) > 400 else ""))
    print(f"\n{sep}")
    print("✨  TWO-LINE SUMMARY")
    print(sep)
    print(summary)
    print(f"{sep}\n")

# =============================================================================
#  Entry point
# =============================================================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python transcribe_and_summarize.py <path/to/call.m4a>")
        sys.exit(1)

    # Fail fast if keys are still placeholders
    if DEEPGRAM_API_KEY == "[DEEPGRAM_API_KEY]":
        raise ValueError("Set your Deepgram API key in DEEPGRAM_API_KEY.")
    if OPENROUTER_API_KEY == "[OPENROUTER_API_KEY]":
        raise ValueError("Set your OpenRouter API key in OPENROUTER_API_KEY.")

    print("\n🎙  Call-Log Transcription & Summarisation Pipeline")
    print("=" * 64)

    transcript = transcribe_audio(sys.argv[1])
    summary    = summarize_transcript(transcript)

    print("[3/3] Done!")
    display_results(transcript, summary)


if __name__ == "__main__":
    main()