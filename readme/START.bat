@echo off
REM Quick Start Script for Call Quality Scoring System
REM Run this to start both backend and frontend

echo ========================================
echo Call Quality Scoring System
echo Quick Start
echo ========================================
echo.

REM Check if backend directory exists
if not exist ".\call_quality_scorer.py" (
    echo Error: call_quality_scorer.py not found
    echo Please run this script from d:\Summarizer directory
    pause
    exit /b 1
)

REM Create venv if it doesn't exist
if not exist ".\venv" (
    echo Creating Python virtual environment...
    python -m venv venv
    echo Activating venv and installing requirements...
    .\venv\Scripts\pip install -r requirements.txt
)

echo.
echo ========================================
echo Starting Services...
echo ========================================
echo.

REM Start backend in a new window
echo Starting FastAPI Backend (Port 8000)...
start "Backend - FastAPI" cmd /k "cd /d %CD% && .\venv\Scripts\activate.bat && python main.py"

REM Wait a moment for backend to start
timeout /t 2 /nobreak

REM Start frontend in a new window
echo Starting React Frontend (Port 5173)...
start "Frontend - React" cmd /k "cd /d %CD%\frontend && npm run dev"

echo.
echo ========================================
echo Services Started
echo ========================================
echo.
echo Frontend: http://localhost:5173/
echo Backend API: http://localhost:8000/
echo API Docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C in either window to stop the service
echo.
pause
