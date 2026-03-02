# API Key Setup Guide

## Quick Start

Your Call Quality Scoring System is now **ready to use**, but requires one API key to unlock LLM evaluation.

### Step 1: Get Your OpenRouter API Key

1. Visit: **https://openrouter.ai/keys**
2. Sign up or log in (free tier available)
3. Create a new API key
4. Copy the key to clipboard

### Step 2: Create `.env` File

In your workspace directory (`d:\Summarizer\`), create a file named `.env` with this content:

```
OPENROUTER_API_KEY=paste_your_key_here
```

**Example** (with fake key):
```
OPENROUTER_API_KEY=sk-or-v1-1234567890abcdefghijklmnop
```

**Important**: 
- File must be named exactly `.env` (no `.txt` extension)
- Place it in `d:\Summarizer\` (the main workspace folder)
- Do NOT commit this file to version control (it's already in .gitignore)

### Step 3: Restart Backend

Kill any running backend server (Ctrl+C), then restart:

```powershell
cd d:\Summarizer
.\venv\Scripts\Activate.ps1
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 4: Test Upload

1. Frontend still running at: **http://localhost:5173**
2. Drag-and-drop an audio file (MP3, WAV, M4A)
3. Backend processes with **full LLM evaluation**
4. Results display in dashboard

### Troubleshooting

**"Using rule-based scoring only" message**:
- `.env` file doesn't exist or API key not found
- Verify `.env` is in `d:\Summarizer\` root
- Verify format: `OPENROUTER_API_KEY=your_actual_key`

**"Invalid API key" error**:
- Key expired or incorrect
- Visit https://openrouter.ai/keys to verify key is active

**"Network Error" on frontend**:
- Backend not running
- Check terminal: `python main.py` should show Uvicorn running
- Check `.env` file exists with valid API key

### Without API Key

The system still works! It will:
- ✅ Accept audio uploads
- ✅ Apply rule-based scoring (40% empathy, 50% professionalism, 45% compliance)
- ✅ Keyword detection (violations, improvements)
- ✅ Save to history
- ❌ Skip LLM evaluation scores (use fallback 10/20 neutral scores)

With API key, you get:
- ✅ Full LLM evaluation (GPT-4o-mini via OpenRouter)
- ✅ Better empathy/professionalism/compliance scoring
- ✅ AI-generated improvement suggestions
- ✅ Production-quality results

---

**Questions?** Check the full README.md or DELIVERY_SUMMARY.md for complete system documentation.
