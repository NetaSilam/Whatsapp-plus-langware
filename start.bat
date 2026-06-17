@echo off
REM Restart the Chatter app and seed 3 demo users (Alice, Bob, Carol).
REM Double-click this file, or run:  start.bat
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
pause
