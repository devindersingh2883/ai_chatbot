from pathlib import Path
from typing import List, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ai_service import get_provider_name, stream_ai_response

app = FastAPI(title="AI Chatbot API", version="1.1.0")

# V1: koi bhi origin allow. Deploy se pehle apne domain tak limit karo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-AI-Provider"],
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


@app.get("/api/health")
def health():
    return {"status": "ok", "provider": get_provider_name()}


@app.post("/api/chat")
def chat(req: ChatRequest):
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message khaali nahi ho sakta.")
    if len(message) > 4000:
        raise HTTPException(status_code=413, detail="Message bahut lamba hai (max 4000 characters).")

    history = [m.model_dump() for m in req.history]

    def event_stream():
        try:
            for chunk in stream_ai_response(message, history):
                yield chunk
        except Exception as e:
            yield f"\n\n[Error] {e}"

    return StreamingResponse(
        event_stream(),
        media_type="text/plain; charset=utf-8",
        headers={"X-AI-Provider": get_provider_name(), "Cache-Control": "no-cache"},
    )


# Frontend bhi isi server se serve hota hai: http://127.0.0.1:8000
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
