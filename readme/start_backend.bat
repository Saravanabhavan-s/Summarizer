@echo off
REM Start Backend for Call Quality Scorer
REM This script activates the virtual environment and starts the FastAPI server

cd /d "%~dp0"

echo.
echo ========================================
echo Call Quality Scorer - Backend Server
echo ========================================
echo.

REM Check if .env file exists
if not exist ".env" (
    echo.
    echo ⚠️  WARNING: .env file not found!
    echo.
    echo You need an OpenRouter API key to use LLM evaluation.
    echo.
    echo Steps:
    echo   1. Visit: https://openrouter.ai/keys
    echo   2. Create/copy your API key
    echo   3. Create .env file with: OPENROUTER_API_KEY=your_key_here
    echo   4. Run this script again
    echo.
    echo Without .env, the system will use rule-based scoring only.
    echo.
)

REM Activate virtual environment
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo Error: Virtual environment not found in venv\Scripts\
    echo Run setup first: python -m venv venv
    pause
    exit /b 1
)

echo.
echo Starting FastAPI server...
echo Server will run on: http://localhost:8000
echo API docs available at: http://localhost:8000/docs
echo.
echo Frontend should be running at: http://localhost:5173
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the server
python main.py

pause
