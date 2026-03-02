# File Index - Call Quality Scoring System

Quick reference guide to all files in the project.

## 📁 Root Directory Files

| File | Purpose | Type |
|------|---------|------|
| `README.md` | Project overview & quick start | Documentation |
| `SETUP_GUIDE.md` | Complete setup instructions | Documentation |
| `DELIVERY_SUMMARY.md` | What was delivered, inventory | Documentation |
| `COMPONENT_CHECKLIST.md` | Verification checklist | Documentation |
| `FILE_INDEX.md` | This file | Documentation |
| `main.py` | FastAPI backend server | Backend Code |
| `requirements.txt` | Python dependencies | Config |
| `.env.example` | Environment template (backend) | Config |
| `START.bat` | Quick start (Windows batch) | Script |
| `START.ps1` | Quick start (PowerShell) | Script |
| `call_quality_scorer.py` | Scoring logic (original) | Backend Code |
| `transcriber.py` | Transcription handler (original) | Backend Code |

## 📁 frontend/ Directory

### Key Files
| File | Purpose |
|------|---------|
| `package.json` | npm dependencies & scripts |
| `vite.config.js` | Vite build configuration |
| `index.html` | HTML entry point |
| `README.md` | Frontend documentation |
| `.env.example` | Environment template (frontend) |

### Source Code

#### src/App.jsx & src/main.jsx
| File | Purpose |
|------|---------|
| `App.jsx` | Main component, state management |
| `main.jsx` | Entry point, renders App |

#### src/components/ (11 Components)

**Layout & Navigation**
- `Sidebar.jsx` - Navigation sidebar with tabs

**Upload Feature**
- `UploadSection.jsx` - Drag-and-drop file upload

**Results Display**
- `ResultDashboard.jsx` - Wrapper for all results
- `ScoreCard.jsx` - Quality score display
- `SummaryCard.jsx` - Call summary
- `ScoreBreakdown.jsx` - Dimension scores breakdown
- `ProgressBar.jsx` - Reusable progress bar
- `ChartsSection.jsx` - Data visualization (Bar + Doughnut)
- `ViolationsCard.jsx` - Issues display
- `ImprovementsCard.jsx` - Suggestions display

**History**
- `HistorySection.jsx` - Call history table

#### src/styles/ (13 CSS Modules)

**Global**
- `index.css` - Global styles

**Component Styles**
- `App.module.css` - App layout
- `Sidebar.module.css` - Sidebar
- `UploadSection.module.css` - Upload section
- `ResultDashboard.module.css` - Results wrapper
- `ScoreCard.module.css` - Score card
- `SummaryCard.module.css` - Summary card
- `ScoreBreakdown.module.css` - Breakdown section
- `ProgressBar.module.css` - Progress bar
- `ChartsSection.module.css` - Charts
- `ViolationsCard.module.css` - Violations
- `ImprovementsCard.module.css` - Improvements
- `HistorySection.module.css` - History table

#### src/utils/ (3 Utility Files)

| File | Purpose | Exports |
|------|---------|---------|
| `api.js` | Axios HTTP client | `processCallAudio()` |
| `constants.js` | Scoring constants | `GRADE_THRESHOLDS`, `SCORE_COLORS`, `getGrade()`, `getGradeLabel()`, `getScoreColor()` |
| `storage.js` | LocalStorage management | `saveCallResult()`, `getCallHistory()`, `getCallResultById()`, `deleteCallResult()`, `clearCallHistory()` |

## 📊 Component Hierarchy

```
App (state: activeTab, currentResult, history)
├── Sidebar (state: none)
│   └── Navigation buttons
├── UploadSection (state: isDragging, isProcessing, error)
│   └── Drop zone
├── ResultDashboard (state: none)
│   ├── ScoreCard
│   ├── SummaryCard
│   ├── ScoreBreakdown
│   │   └── ProgressBar (× 3)
│   ├── ChartsSection
│   │   ├── BarChart
│   │   └── PieChart
│   ├── ViolationsCard
│   └── ImprovementsCard
└── HistorySection (state: none)
    └── History table rows
```

## 🔧 API Endpoints

| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| POST | `/process-call` | Process audio file | ✅ Implemented |
| GET | `/health` | Health check | ✅ Implemented |
| GET | `/` | Root info | ✅ Implemented |
| GET | `/docs` | Swagger UI | ✅ Auto-generated |

## 📋 Configuration Files

### Environment Variables

**Backend (.env)**
```
OPENROUTER_API_KEY=xxx
OPENROUTER_MODEL=openai/gpt-4o-mini
PORT=8000
```

**Frontend (.env)**
```
VITE_API_BASE_URL=http://localhost:8000
```

### Build & Run

**Frontend Scripts** (package.json)
- `npm install` - Install dependencies
- `npm run dev` - Start dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

**Backend Scripts**
- `python main.py` - Run FastAPI server
- `pip install -r requirements.txt` - Install dependencies

## 📐 Data Flow

```
User Action
    ↓
Frontend Component (React)
    ↓
API Client (axios)
    ↓
FastAPI Backend (main.py)
    ↓
Scoring Logic (call_quality_scorer.py)
    ↓
LLM API (OpenRouter)
    ↓
JSON Response
    ↓
Frontend Display (Dashboard)
    ↓
LocalStorage (History)
```

## 🎨 Styling Architecture

**CSS Modules** (No global pollution)
- Each component has its own `.module.css`
- Automatic class name scoping
- Easy to maintain and modify
- No naming conflicts

**Color Scheme**
- Background: `#faf8f3` (ivory)
- Primary: `#1f2937` (navy)
- Accent: `#d1a574` (gold)
- Success: `#10b981` (green)
- Warning: `#f59e0b` (orange)
- Error: `#ef4444` (red)

## 🚀 Deployment Files

| File | Purpose |
|------|---------|
| `Dockerfile` (optional) | Container deployment |
| `vercel.json` (optional) | Vercel deployment config |
| `netlify.toml` (optional) | Netlify deployment config |
| `Procfile` (optional) | Heroku deployment |

Note: These are optional - use as needed.

## 📚 Documentation Files

| File | Audience | Content |
|------|----------|---------|
| `README.md` | Everyone | Project overview |
| `SETUP_GUIDE.md` | Developers | Installation steps |
| `DELIVERY_SUMMARY.md` | Project managers | Inventory |
| `COMPONENT_CHECKLIST.md` | QA/Verification | Testing checklist |
| `FILE_INDEX.md` | Developers | This file |
| `frontend/README.md` | Frontend devs | Tech details |

## 📦 Dependencies Summary

### Frontend (package.json)
```
react@18+
react-dom@18+
vite@7+
axios@latest
recharts@latest
(No other UI frameworks)
```

### Backend (requirements.txt)
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6
python-dotenv==1.0.0
openai==1.3.9
requests==2.31.0
pydantic==2.5.0
```

## 🔐 Security Considerations

| Area | Implementation |
|------|----------------|
| CORS | Enabled with whitelist |
| File Upload | Type & size validation |
| API Key | Environment variable |
| Error Messages | Non-revealing |
| Input Validation | Frontend + Backend |

## 📱 Responsive Breakpoints

| Device | Width | Breakpoint |
|--------|-------|-----------|
| Desktop | 1025px+ | Default |
| Tablet | 769-1024px | Medium |
| Mobile | 481-768px | Small |
| Extra Mobile | <481px | Extra Small |

## 🎯 Testing Checkpoints

1. **Frontend Loads** - No errors
2. **Upload Works** - File accepted
3. **API Calls** - Network tab shows requests
4. **Results Display** - Dashboard renders
5. **History Saves** - LocalStorage working
6. **Delete Works** - Records removed
7. **Responsive** - Mobile layout adjusts

## 🔍 File Search Guide

| Looking for | File |
|-------------|------|
| API endpoint | `main.py` |
| Scoring logic | `call_quality_scorer.py` |
| React app | `frontend/src/App.jsx` |
| Styles | `frontend/src/styles/` |
| Upload feature | `frontend/src/components/UploadSection.jsx` |
| Results display | `frontend/src/components/ResultDashboard.jsx` |
| History | `frontend/src/components/HistorySection.jsx` |
| API client | `frontend/src/utils/api.js` |
| Constants | `frontend/src/utils/constants.js` |
| LocalStorage | `frontend/src/utils/storage.js` |
| Setup instructions | `SETUP_GUIDE.md` |

## 📈 Lines of Code Stats

| Area | Estimate |
|------|----------|
| Frontend Components | ~1500 LOC |
| Frontend Styling | ~1200 LOC |
| Frontend Utils | ~200 LOC |
| Backend | ~200 LOC |
| Documentation | ~2000 LOC |
| **Total** | **~5100 LOC** |

## ⚡ Quick Commands

```bash
# Start everything
START.bat  # Windows

# Backend only
python main.py

# Frontend only
cd frontend && npm run dev

# Install dependencies
pip install -r requirements.txt  # Python
npm install  # JavaScript

# Build frontend
cd frontend && npm run build

# Check backend health
curl http://localhost:8000/health

# View API docs
http://localhost:8000/docs
```

## 🆘 Help Resources

| Issue | Resource |
|-------|----------|
| Setup problem | `SETUP_GUIDE.md` |
| File not found | This file + `FILE_INDEX.md` |
| Component question | `frontend/README.md` |
| API issue | Backend `/docs` endpoint |
| Styling | CSS modules in `frontend/src/styles/` |
| State management | `frontend/src/App.jsx` |

---

**Last Updated**: February 27, 2026
**Version**: 1.0.0

For more info, check README.md
