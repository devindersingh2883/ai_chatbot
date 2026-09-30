# AI Chatbot (V1)

Frontend: HTML/CSS/JS | Backend: Python + FastAPI | Database: none

## Sabse aasaan tareeka (Windows)
`start.bat` par double-click karo. Browser me http://127.0.0.1:8000 khul jaayega.

## Manual (CMD)
    cd ai-chatbot
    python -m venv venv
    venv\Scripts\activate
    pip install -r backend\requirements.txt
    cd backend
    uvicorn main:app --port 8000
Phir browser me http://127.0.0.1:8000 kholo (frontend isi server se serve hota hai).

## AI providers (backend/ai_service.py)
- colab: google.colab.ai (sirf Google Colab me chalta hai)
- demo:  fake streamed reply (PC par automatic)
AI_PROVIDER env variable se force karo: auto | colab | demo

## Colab se real AI use karna
Backend Colab me chalao + ngrok tunnel, phir chat page me "Backend URL" button se ngrok URL daalo.

## Real AI API baad me
Sirf backend/ai_service.py badlo: naya `_stream_xyz()` function (chunks yield kare) + stream_ai_response() me branch.
API key hamesha backend me env variable se, frontend me kabhi nahi.
