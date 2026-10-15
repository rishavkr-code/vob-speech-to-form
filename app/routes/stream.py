"""WebSocket relay: browser PCM audio -> Deepgram live -> Deepgram JSON back to the browser."""

import asyncio
import json
import wave
from datetime import datetime

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import settings
from ..catalog import DEEPGRAM_MODELS, DEFAULT_STT_MODEL, SAMPLE_RATE
from ..stt import deepgram_live_url

router = APIRouter()


@router.websocket("/ws/deepgram")
async def deepgram_stream(ws: WebSocket, model: str = DEFAULT_STT_MODEL):
    """Relay browser audio (16 kHz linear16 PCM) to Deepgram live and relay Deepgram's JSON
    results back. With SAVE_RECORDINGS on, saves the session's audio and final transcript."""
    await ws.accept()
    if model not in DEEPGRAM_MODELS:
        await ws.close(code=1008, reason="unknown model")
        return

    try:
        dg = await websockets.connect(
            deepgram_live_url(model), additional_headers={"Authorization": f"Token {settings.DEEPGRAM_API_KEY}"}
        )
    except Exception as e:
        await ws.send_json({"type": "Error", "message": f"Deepgram connect failed: {e}"})
        await ws.close()
        return

    audio = bytearray()
    finals: list[str] = []

    async def browser_to_dg():
        try:
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if msg.get("bytes"):
                    if settings.SAVE_RECORDINGS:
                        audio.extend(msg["bytes"])
                    await dg.send(msg["bytes"])
                elif msg.get("text") == "stop":
                    break
        except WebSocketDisconnect:
            pass
        finally:
            # Ask Deepgram to flush remaining audio and finish.
            try:
                await dg.send(json.dumps({"type": "CloseStream"}))
            except Exception:
                pass

    async def dg_to_browser():
        try:
            async for raw in dg:
                text = raw if isinstance(raw, str) else raw.decode()
                m = json.loads(text)
                if m.get("type") == "Results" and m.get("is_final"):
                    t = m["channel"]["alternatives"][0]["transcript"]
                    if t:
                        finals.append(t)
                await ws.send_text(text)
        except Exception:
            pass

    async def keepalive():
        while True:
            await asyncio.sleep(5)
            await dg.send(json.dumps({"type": "KeepAlive"}))

    ka = asyncio.create_task(keepalive())
    try:
        await asyncio.gather(browser_to_dg(), dg_to_browser())
    finally:
        ka.cancel()
        await dg.close()
        try:
            await ws.close()
        except Exception:
            pass
        if audio:
            save_recording(model, bytes(audio), " ".join(finals))


def save_recording(model: str, audio: bytes, transcript: str):
    settings.RECORDINGS.mkdir(parents=True, exist_ok=True)
    name = settings.RECORDINGS / f"{datetime.now():%Y%m%d-%H%M%S}-{model}"
    with wave.open(str(name.with_suffix(".wav")), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(audio)
    name.with_suffix(".txt").write_text(transcript + "\n")
