"""
AI generation layer.
main.py sirf stream_ai_response() call karta hai.

Providers:
  colab  -> google.colab.ai (sirf Google Colab me)
  ollama -> aapke PC par chalne wala free local AI (koi API key nahi)
  demo   -> fake reply (jab dono available na ho)

AI_PROVIDER=auto (default): colab -> ollama -> demo
"""
import json
import os
import time
import urllib.error
import urllib.request
from typing import Dict, Iterator, List

AI_PROVIDER = os.getenv("AI_PROVIDER", "auto").lower()   # auto | colab | ollama | demo
COLAB_MODEL = os.getenv("COLAB_MODEL", "")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
SYSTEM_PROMPT = os.getenv(
    "SYSTEM_PROMPT",
    "You are a helpful AI assistant. Reply in the same language the user writes in "
    "(Hindi, Hinglish or English). Keep answers clear and concise.",
)

try:
    from google.colab import ai as colab_ai
    COLAB_AVAILABLE = True
except Exception:
    colab_ai = None
    COLAB_AVAILABLE = False


class AIServiceError(Exception):
    """AI layer response nahi de paayi."""


# ---------- provider detection ----------
_cache = {"t": 0.0, "ok": False}


def ollama_running() -> bool:
    now = time.time()
    if now - _cache["t"] < 5:          # 5 second cache
        return _cache["ok"]
    try:
        with urllib.request.urlopen(OLLAMA_URL + "/api/tags", timeout=1) as r:
            ok = r.status == 200
    except Exception:
        ok = False
    _cache["t"], _cache["ok"] = now, ok
    return ok


def get_provider_name() -> str:
    if AI_PROVIDER in ("colab", "ollama", "demo"):
        return AI_PROVIDER
    if COLAB_AVAILABLE:
        return "colab"
    if ollama_running():
        return "ollama"
    return "demo"


# ---------- colab ----------
def build_prompt(message: str, history: List[Dict[str, str]]) -> str:
    lines = ["You are a helpful AI assistant. Continue the conversation."]
    for m in history[-10:]:
        who = "User" if m["role"] == "user" else "Assistant"
        lines.append(f"{who}: {m['content']}")
    lines.append(f"User: {message}")
    lines.append("Assistant:")
    return "\n".join(lines)


def _stream_colab(message: str, history: List[Dict[str, str]]) -> Iterator[str]:
    if not COLAB_AVAILABLE:
        raise AIServiceError("Colab AI yahan available nahi hai (sirf Google Colab me chalta hai).")
    kwargs = {"prompt": build_prompt(message, history), "stream": True}
    if COLAB_MODEL:
        kwargs["model_name"] = COLAB_MODEL
    for new_chunk in colab_ai.generate_text(**kwargs):   # aapka original logic
        if new_chunk is None:
            continue
        yield new_chunk


# ---------- ollama (local, free) ----------
def _stream_ollama(message: str, history: List[Dict[str, str]]) -> Iterator[str]:
    messages = (
        [{"role": "system", "content": SYSTEM_PROMPT}]
        + history[-10:]
        + [{"role": "user", "content": message}]
    )
    payload = json.dumps({"model": OLLAMA_MODEL, "messages": messages, "stream": True}).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL + "/api/chat", data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            for raw in resp:                       # Ollama har line me ek JSON bhejta hai
                line = raw.decode("utf-8").strip()
                if not line:
                    continue
                data = json.loads(line)
                if data.get("error"):
                    raise AIServiceError(data["error"])
                chunk = data.get("message", {}).get("content", "")
                if chunk:
                    yield chunk
                if data.get("done"):
                    break
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        if e.code == 404:
            raise AIServiceError(
                f"Model '{OLLAMA_MODEL}' nahi mila. CMD me chalao: ollama pull {OLLAMA_MODEL}"
            )
        raise AIServiceError(f"Ollama error {e.code}: {body[:200]}")
    except urllib.error.URLError:
        raise AIServiceError("Ollama chal nahi raha. Ollama app kholo (ya CMD me: ollama serve).")


# ---------- demo ----------
def _stream_demo(message: str) -> Iterator[str]:
    reply = (
        f"**Demo mode**: aapne likha: \"{message}\"\n\n"
        "Ye fake reply hai. Real AI ke liye Ollama install karo aur "
        f"`ollama pull {OLLAMA_MODEL}` chalao, phir server restart karo."
    )
    for word in reply.split(" "):
        yield word + " "
        time.sleep(0.03)


# ---------- main entry ----------
def stream_ai_response(message: str, history: List[Dict[str, str]]) -> Iterator[str]:
    provider = get_provider_name()
    if provider == "colab":
        yield from _stream_colab(message, history)
    elif provider == "ollama":
        yield from _stream_ollama(message, history)
    else:
        yield from _stream_demo(message)