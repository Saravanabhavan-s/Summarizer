# Call Quality Scorer - React Frontend

A modern, elegant React frontend for the Call Quality Scoring System. Provides real-time call analysis with hybrid rule-based and LLM evaluation.

## Features

✨ **Beautiful UI**
- Classical, elegant aesthetic with navy and muted gold accents
- Soft shadows and smooth animations
- Responsive design (desktop, tablet, mobile)
- Light off-white/ivory background

📊 **Results Dashboard**
- Real-time quality score with animated counter
- Letter grade badge (A-F) with color coding
- Dimension breakdown (Empathy, Professionalism, Compliance)
- Interactive charts (Bar chart + Doughnut chart)
- Violations and improvement suggestions

🎵 **Audio Upload**
- Drag-and-drop interface
- File validation (size & format)
- Upload progress indicator
- Support for MP3, WAV, M4A formats

📋 **Call History**
- LocalStorage persistence (up to 50 entries)
- Quick access to previous analyses
- Delete individual records

## Quick Start

### Installation

```bash
cd frontend
npm install
```

### Run Development Server

```bash
npm run dev
```

Open the URL shown by Vite in your terminal after running the dev server.

### Build for Production

```bash
npm run build
npm run preview
```

## API Configuration

Set your backend URL in environment variables:

```javascript
VITE_API_URL=http://localhost:8080
```

Expected backend endpoint: `POST /process-call`

## Tech Stack

- React 18 with Hooks
- Vite 7 (build tool)
- Axios (HTTP client)
- Recharts (visualization)
- CSS Modules
- LocalStorage

## Project Structure

```
src/
├── components/
│   ├── Sidebar.jsx
│   ├── UploadSection.jsx
│   ├── ResultDashboard.jsx
│   ├── ScoreCard.jsx
│   ├── ScoreBreakdown.jsx
│   ├── ChartsSection.jsx
│   ├── ViolationsCard.jsx
│   ├── ImprovementsCard.jsx
│   ├── HistorySection.jsx
│   └── ...
├── styles/ (CSS Modules)
├── utils/
│   ├── api.js (API client)
│   ├── constants.js (config)
│   └── storage.js (localStorage)
├── App.jsx
└── main.jsx
```

## Usage

1. **Upload**: Drag-and-drop or select audio file
2. **Wait**: Processing with LLM (10-30 seconds)
3. **View**: See scores, charts, and recommendations
4. **History**: Access previous analyses anytime

## Styling

- **No UI libraries** (MUI, Bootstrap, Tailwind)
- **CSS Modules** for component isolation
- **Custom theme**: Navy + Muted Gold
- **Responsive**: Mobile-first approach

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Deployment

### Vercel
```bash
vercel
```

### Netlify
```bash
npm run build
# Upload dist/ folder
```

### Docker
See Dockerfile setup in documentation

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't connect to backend | Check API_BASE_URL in constants.js, verify CORS |
| File upload fails | Ensure file is <100MB and MP3/WAV/M4A format |
| History not showing | Check LocalStorage, clear cache if needed |
| Charts not rendering | Verify recharts is installed, check console |

## Documentation

See [full documentation](./src/components/README.md) for detailed component APIs.

---

**Version**: 1.0.0 | **Status**: Production Ready
