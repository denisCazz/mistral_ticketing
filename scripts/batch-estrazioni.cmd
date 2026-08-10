@echo off
REM Batch estrazioni documenti (OCR + struttura AI) con log OK/FAIL/REVIEW
cd /d "%~dp0.."
call npm run documenti:batch-estrazioni -- %*
echo.
echo Log in cartella logs\
pause
