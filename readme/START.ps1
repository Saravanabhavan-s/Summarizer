#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quick start script for Call Quality Scoring System
.DESCRIPTION
    Starts both FastAPI backend and React frontend in separate windows
#>

write-host "========================================"
write-host "Call Quality Scoring System"
write-host "Quick Start"
write-host "========================================" -ForegroundColor Green
write-host ""

# Check if we're in the right directory
if (-not (Test-Path "call_quality_scorer.py")) {
    write-error "call_quality_scorer.py not found"
    write-host "Please run this script from d:\Summarizer directory"
    exit 1
}

# Create venv if needed
if (-not (Test-Path "venv")) {
    write-host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv venv
    
    write-host "Installing Python dependencies..." -ForegroundColor Yellow
    .\venv\Scripts\pip install -r requirements.txt
    write-host "Done!" -ForegroundColor Green
}

write-host ""
write-host "========================================"
write-host "Starting Services..."
write-host "========================================" -ForegroundColor Green
write-host ""

# Start backend
$backendScript = {
    Set-Location $args[0]
    .\venv\Scripts\Activate.ps1
    python main.py
}

$backendJobName = "CallQualityBackend"
if (Get-Job -Name $backendJobName -ErrorAction SilentlyContinue) {
    Stop-Job -Name $backendJobName
    Remove-Job -Name $backendJobName
}

write-host "Starting FastAPI Backend (Port 8000)..." -ForegroundColor Cyan
$backendJob = Start-Job -Name $backendJobName -ScriptBlock $backendScript -ArgumentList (Get-Location)

# Start frontend
$frontendScript = {
    Set-Location $args[0]
    npm run dev
}

$frontendJobName = "CallQualityFrontend"
if (Get-Job -Name $frontendJobName -ErrorAction SilentlyContinue) {
    Stop-Job -Name $frontendJobName
    Remove-Job -Name $frontendJobName
}

write-host "Starting React Frontend (Port 5173)..." -ForegroundColor Cyan
$frontendJob = Start-Job -Name $frontendJobName -ScriptBlock $frontendScript -ArgumentList "$(Get-Location)\frontend"

# Wait a moment for services to start
Start-Sleep -Seconds 2

write-host ""
write-host "========================================"
write-host "Services Started Successfully" -ForegroundColor Green
write-host "========================================="
write-host ""
write-host "Frontend:        http://localhost:5173/" -ForegroundColor Yellow
write-host "Backend API:     http://localhost:8000/" -ForegroundColor Yellow
write-host "API Docs:        http://localhost:8000/docs" -ForegroundColor Yellow
write-host ""
write-host "View logs with:" -ForegroundColor Cyan
write-host "  Get-Job | Receive-Job -Keep"
write-host ""
write-host "Stop services with:" -ForegroundColor Cyan
write-host "  Stop-Job -Name CallQualityBackend"
write-host "  Stop-Job -Name CallQualityFrontend"
write-host ""

# Wait for user input
write-host "Press Ctrl+C to stop all services" -ForegroundColor Red
write-host ""

# Keep the script running
while ($true) {
    Start-Sleep -Seconds 1
    
    # Check if jobs are still running
    $backendRunning = (Get-Job -Name $backendJobName -ErrorAction SilentlyContinue).State -eq "Running"
    $frontendRunning = (Get-Job -Name $frontendJobName -ErrorAction SilentlyContinue).State -eq "Running"
    
    if (-not $backendRunning) {
        write-host "Backend stopped!" -ForegroundColor Red
        break
    }
    if (-not $frontendRunning) {
        write-host "Frontend stopped!" -ForegroundColor Red
        break
    }
}
