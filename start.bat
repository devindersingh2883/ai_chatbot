@echo off
cd /d "%~dp0"
if not exist venv (
  echo Creating virtual environment...
  python -m venv venv
)
call venv\Scripts\activate
echo Installing dependencies...
pip install -q -r backend\requirements.txt
start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:8000"
cd backend
echo.
echo Server chal raha hai: http://127.0.0.1:8000   (band karne ke liye Ctrl+C)
uvicorn main:app --port 8000
pause
