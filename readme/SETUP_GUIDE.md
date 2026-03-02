# Complete Setup Guide - Call Quality Scoring System

This guide covers setting up both the Python backend and React frontend for the Call Quality Scoring System.

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Call Quality Scorer                     │
├──────────────────────┬──────────────────────────────────┤
│   Python Backend     │      React Frontend              │
│   (FastAPI/Flask)    │      (Vite + React)             │
│   Port 8000          │      Port 5173                   │
└──────────────────────┴──────────────────────────────────┘
```

## Part 1: Python Backend Setup

### Prerequisites
- Python 3.9+
- pip or poetry
- OpenRouter API key (for GPT-4 access)
- Git

### 1.1 Create Backend Environment

```bash
cd d:\Summarizer
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows PowerShell
# On Mac/Linux: source venv/bin/activate
```

### 1.2 Install Dependencies

```bash
pip install fastapi uvicorn python-multipart openai python-dotenv
# or for audio transcription support:
pip install openai-whisper
```

### 1.3 Configure Environment

Create `.env` file in `d:\Summarizer\`:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=openai/gpt-4o-mini
```

Get your API key from: https://openrouter.ai/

### 1.4 Verify Backend Files

Ensure you have:
- `call_quality_scorer.py` - Quality scoring logic
- `transcriber.py` - Audio transcription (if using)

### 1.5 Create FastAPI Backend (main.py or app.py)

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from call_quality_scorer import evaluate_call_quality
import os

app = FastAPI(title="Call Quality Scorer API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/process-call")
async def process_call(file: UploadFile = File(...)):
    """
    Process audio file and return quality scores
    """
    try:
        # Read file
        contents = await file.read()
        
        # TODO: Transcribe audio to text
        # transcript = transcribe_audio(contents)
        
        # For testing, use sample transcript
        transcript = "Sample call transcript here"
        
        # Score the call
        result = evaluate_call_quality(transcript, verbose=False)
        
        # Format response
        return {
            "filename": file.filename,
            "duration_seconds": 0,  # Extract from audio
            "summary": "Call summary here",  # Extract from LLM
            "quality_score": result['quality_score'],
            "empathy_score": result['empathy_score'],
            "professionalism_score": result['professionalism_score'],
            "compliance_score": result['compliance_score'],
            "violations": result['violations'],
            "improvements": result['improvements']
        }
    except Exception as e:
        return {"error": str(e)}, 500

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 1.6 Run Backend

```bash
# Activate venv first
.\venv\Scripts\Activate.ps1

# Run server
python main.py
# or
uvicorn main:app --reload --port 8000
```

Backend will be available at: `http://localhost:8000`

---

## Part 2: React Frontend Setup

### Prerequisites
- Node.js 16+ (with npm)

### 2.1 Navigate to Frontend

```bash
cd d:\Summarizer\frontend
```

### 2.2 Install Dependencies

```bash
npm install
```

Already installed packages:
- axios (HTTP client)
- recharts (charting)
- react 18
- vite

### 2.3 Configure API Endpoint

**Option A**: Modify `src/utils/api.js` (for development)
```javascript
const API_BASE_URL = 'http://localhost:8000';
```

**Option B**: Use environment variables (recommended)

Create `.env` file:
```
VITE_API_BASE_URL=http://localhost:8000
```

### 2.4 Start Development Server

```bash
npm run dev
```

Frontend will be available at: `http://localhost:5173`

### 2.5 Production Build

```bash
npm run build
npm run preview  # Test production build locally
```

---

## Part 3: End-to-End Testing

### 3.1 Both Servers Running

Keep two terminals open:

**Terminal 1 (Backend)**:
```bash
cd d:\Summarizer
.\venv\Scripts\Activate.ps1
python main.py
# Expected: API running on http://localhost:8000
```

**Terminal 2 (Frontend)**:
```bash
cd d:\Summarizer\frontend
npm run dev
# Expected: App running on http://localhost:5173
```

### 3.2 Test Upload Flow

1. Open `http://localhost:5173/`
2. Go to **Upload** tab
3. Select/drag an audio file (MP3, WAV, M4A)
4. Observe:
   - Upload progress bar
   - Processing spinner
   - Backend receiving request
   - Results displaying

### 3.3 Check API Response

Use curl or Postman to test backend directly:

```bash
curl -X POST http://localhost:8000/process-call \
  -F "file=@audio_sample.mp3"
```

Expected response:
```json
{
  "filename": "audio_sample.mp3",
  "duration_seconds": 120,
  "summary": "...",
  "quality_score": 85.5,
  "empathy_score": 82.0,
  "professionalism_score": 88.0,
  "compliance_score": 86.5,
  "violations": [],
  "improvements": [...]
}
```

---

## Part 4: Project Organization

### Directory Structure

```
d:\Summarizer\
├── call_quality_scorer.py      # Scoring logic
├── transcriber.py               # Audio transcription
├── human_chat.txt               # Sample data
├── .env                         # Backend config
├── main.py (or app.py)          # FastAPI backend
├── venv/                        # Python virtual environment
│
└── frontend/                    # React application
    ├── src/
    │   ├── components/          # React components
    │   ├── styles/              # CSS modules
    │   ├── utils/               # Helper functions
    │   ├── App.jsx
    │   └── main.jsx
    ├── .env                     # Frontend config
    ├── package.json
    ├── vite.config.js
    └── index.html
```

---

## Part 5: Troubleshooting

### Backend Issues

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError` | Install missing packages: `pip install [package]` |
| `OPENROUTER_API_KEY not found` | Create `.env` file in project root with API key |
| Port 8000 already in use | Change port: `uvicorn main:app --port 8001` |
| CORS errors | Enable CORS in FastAPI (see code above) |

### Frontend Issues

| Issue | Solution |
|-------|----------|
| `npm ERR! 404` | Delete node_modules, package-lock.json, run `npm install` |
| `Cannot connect to backend` | Verify backend URL in `.env` or `api.js` |
| Port 5173 in use | Kill existing process or change port |
| Styles not loading | Clear browser cache, restart dev server |

### Network Issues

**Backend can't connect to OpenRouter**:
```bash
# Test internet connection
ping openrouter.ai

# Verify API key is valid
# Visit https://openrouter.ai/keys
```

**Frontend can't reach backend**:
```bash
# Test backend health
curl http://localhost:8000/health

# Check CORS headers
curl -H "Origin: http://localhost:5173" http://localhost:8000/health
```

---

## Part 6: Deployment

### Deploy Backend (Heroku/Railway)

1. Create `requirements.txt`:
   ```bash
   pip freeze > requirements.txt
   ```

2. Add to Procfile:
   ```
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

3. Deploy with Heroku:
   ```bash
   heroku create call-quality-api
   heroku config:set OPENROUTER_API_KEY=your_key
   git push heroku main
   ```

### Deploy Frontend (Vercel/Netlify)

**Vercel**:
```bash
npm install -g vercel
vercel -- --prod
```

**Netlify**:
```bash
npm run build
# Upload dist/ folder via Netlify dashboard
```

Update API URL for production:
```env
VITE_API_BASE_URL=https://call-quality-api.herokuapp.com
```

---

## Part 7: Development Workflow

### Making Changes

1. **Backend changes**:
   - Edit `call_quality_scorer.py` or `main.py`
   - Dev server auto-reloads with `--reload` flag

2. **Frontend changes**:
   - Edit React components in `src/`
   - Dev server hot-reloads instantly (HMR)

3. **Testing**:
   - Use browser DevTools (F12)
   - Check Network tab for API calls
   - Check Console for errors

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes
# ...

# Commit
git add .
git commit -m "feat: add new feature"

# Push
git push origin feature/new-feature
```

---

## Quick Links

- **Backend Docs**: FastAPI - https://fastapi.tiangolo.com/
- **Frontend Docs**: React - https://react.dev/
- **Recharts**: https://recharts.org/
- **OpenRouter**: https://openrouter.ai/
- **Vite**: https://vite.dev/

---

## Support

For issues or questions:
1. Check troubleshooting section
2. Review error messages in console
3. Check API response structure
4. Verify environment variables

---

**Last Updated**: February 27, 2026  
**Version**: 1.0.0
