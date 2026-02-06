@echo off
chcp 65001 >nul
title Folio-OCR

echo ========================================
echo        Folio-OCR
echo ========================================
echo.

cd /d %~dp0

:: Check if venv exists
if exist "venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
) else (
    echo Warning: Virtual environment not found, using global Python
)

echo.
echo Starting server at http://localhost:3000
echo Press Ctrl+C to stop
echo.
echo ========================================
echo.

python server.py

pause
