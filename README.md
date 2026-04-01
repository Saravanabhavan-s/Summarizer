[EchoScore Agile Document.xlsx](https://github.com/user-attachments/files/26418307/EchoScore.Agile.Document.xlsx)
# EchoScore

AI-powered call quality evaluation platform for analyzing customer support calls using transcription, LLM scoring, compliance validation, RAG retrieval, and interactive dashboards.

## Contents

* Overview
* Features
* Architecture
* Tech Stack
* Project Structure
* Quick Start
* Configuration (.env)
* Running (Docker)
* Running (Local)
* API Reference
* Authentication
* Call Processing Flow
* Live Monitoring
* Reporting
* Deployment Notes
* Future Enhancements
* License

## Overview

EchoScore is an AI-powered platform that evaluates recorded and live customer support calls.

The platform allows users to:

* Upload audio files
* Generate transcripts using Deepgram
* Create AI-generated summaries
* Score calls based on empathy, professionalism, compliance, and communication quality
* Compare multiple calls
* Generate PDF and CSV reports
* View analytics in an admin dashboard
* Monitor live calls in real time
* Use RAG-based policy retrieval for compliance validation

EchoScore is built using React for frontend, FastAPI for backend, MongoDB for database storage, Deepgram for transcription, and Milvus for vector search.

## Features

* JWT-based authentication and role-based access
* Audio upload and transcript generation
* Deepgram speech-to-text integration
* AI-generated call summaries
* Hybrid scoring engine for empathy, professionalism, compliance, and resolution quality
* RAG-based policy retrieval using Milvus
* Interactive dashboard with charts and analytics
* Call history tracking
* Compare calls feature
* PDF and CSV report generation
* Admin dashboard with telemetry and logs
* Real-time live call monitoring
* Dockerized deployment
* AWS EC2 + Nginx + HTTPS support

## Architecture

Frontend:

* React
* Tailwind CSS
* Chart.js
* AuthContext for authentication state
* API wrapper layer for backend communication

Backend:

* FastAPI
* JWT authentication
* MongoDB collections for users, calls, reports, and analytics
* Deepgram transcription service
* Milvus vector database for RAG retrieval
* LLM-based scoring engine

Infrastructure:

* Docker containers
* AWS EC2 hosting
* Nginx reverse proxy
* HTTPS using Certbot
* Vercel frontend deployment

## Tech Stack

* Frontend: React, Tailwind CSS, Chart.js
* Backend: FastAPI, Python
* Database: MongoDB
* Authentication: JWT
* AI/LLM: OpenAI, Hugging Face Models
* Transcription: Deepgram API
* Vector Database: Milvus
* Deployment: Docker, AWS EC2, Nginx, Vercel
* Reports: PDF and CSV generation

## Project Structure

```bash
frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── context/
│   ├── api/
│   └── styles/

backend/
├── main.py
├── auth.py
├── call_quality_scorer.py
├── rag_pipeline.py
├── transcriber.py
├── reporting.py
├── live_transcription.py
├── admin_db.py
├── requirements.txt
└── Dockerfile
```

## Quick Start

### Prerequisites

* Python 3.10+
* Node.js 18+
* MongoDB
* Docker
* Deepgram API Key
* OpenAI API Key
* Milvus instance

### Clone Repository

```bash
git clone <repository-url>
cd echoscore
```

## Configuration (.env)

```env
MONGO_URI=
JWT_SECRET=
DEEPGRAM_API_KEY=
OPENAI_API_KEY=
MILVUS_HOST=
MILVUS_PORT=
CORS_ORIGINS=
REPORT_PATH=
```

Optional:

```env
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
NGINX_DOMAIN=
CERTBOT_EMAIL=
```

## Running (Docker)

```bash
docker build -t echoscore-backend .

docker run -d \
  --name echoscore-backend \
  -p 8000:8000 \
  --env-file .env \
  echoscore-backend
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Running (Local)

Backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## API Reference

### Authentication

#### POST /signup

```json
{
  "name": "Saravanabhavan",
  "email": "user@example.com",
  "password": "password123"
}
```

#### POST /login

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "access_token": "jwt_token",
  "role": "admin"
}
```

### Upload Audio

#### POST /process-call

```json
{
  "audio_file": "customer_call.wav"
}
```

Response:

```json
{
  "transcript": "generated transcript",
  "summary": "AI generated summary",
  "scores": {
    "empathy": 82,
    "professionalism": 91,
    "compliance": 76,
    "overall": 84
  }
}
```

### Live Call Monitoring

#### POST /score-live-chunk

```json
{
  "session_id": "live123",
  "chunk_text": "Hello sir, I understand your issue"
}
```

### Reports

#### GET /download-report/{id}

Downloads generated PDF or CSV report.

## Authentication

EchoScore uses JWT authentication for secure login and role-based authorization.

Roles:

* Admin
* User

Protected routes require:

```http
Authorization: Bearer <jwt_token>
```

## Call Processing Flow

1. User uploads audio file
2. Backend stores file temporarily
3. Deepgram generates transcript
4. LLM generates summary
5. Scoring engine evaluates transcript
6. RAG retrieves relevant compliance policies
7. Final report is generated
8. Results are stored in MongoDB
9. Dashboard displays score breakdown and charts

## Live Monitoring

EchoScore supports chunk-based live transcription and scoring.

Features:

* Real-time transcript updates
* Live empathy and professionalism scores
* Session save and completion APIs
* Real-time dashboard refresh

## Reporting

Supported report formats:

* PDF
* CSV

Report contents:

* Transcript
* Summary
* Score breakdown
* Compliance violations
* Suggested improvements
* Overall performance insights

## Deployment Notes

* Deploy backend using Docker on AWS EC2
* Use Nginx reverse proxy for HTTPS
* Configure Certbot SSL certificates
* Host frontend on Vercel
* Store MongoDB in cloud or local server
* Use Milvus for vector search
* Configure CORS correctly for frontend-backend communication

## Future Enhancements

* Multi-language support
* Voice sentiment analysis
* Agent leaderboard system
* Automated email report delivery
* More detailed compliance scoring
* Real-time supervisor alerts
* Fine-tuned LLM scoring model
* Advanced analytics dashboard

## License

MIT License
