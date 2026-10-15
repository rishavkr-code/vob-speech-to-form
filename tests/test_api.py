"""Route tests. The LLM call is stubbed, so these run offline and without API keys."""

import pytest
from fastapi.testclient import TestClient

from app import extract as extract_mod
from app.catalog import FALLBACK_MODEL, FIELDS
from app.main import app

client = TestClient(app)


@pytest.fixture
def llm(monkeypatch):
    """Replace the OpenRouter call; tests set `llm.replies` to a list of (fields, error) per call."""
    calls = []

    async def fake(model, user):
        calls.append((model, user))
        return stub.replies.pop(0)

    stub = type("Stub", (), {"replies": [], "calls": calls})()
    monkeypatch.setattr(extract_mod, "call_llm", fake)
    return stub


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_config_lists_fields_and_models():
    body = client.get("/api/config").json()
    assert set(body["fields"]) == set(FIELDS)
    assert body["stt_models"] == ["nova-3", "nova-3-medical"]
    assert body["extract_models"]


def test_extract_returns_normalized_fields(llm):
    llm.replies = [({**dict.fromkeys(FIELDS), "last_name": "QUEZADA", "insurance_provider": "united"}, None)]
    r = client.post("/api/extract", json={"transcript": "last name quezada", "today": "2026-10-15"})
    assert r.status_code == 200
    body = r.json()
    assert body["fields"]["last_name"] == "Quezada"
    assert body["fields"]["insurance_provider"] == "UnitedHealthcare"
    assert body["fallback_reason"] is None
    assert "Today's date: 2026-10-15" in llm.calls[0][1]


def test_extract_falls_back_when_model_fails(llm):
    llm.replies = [(None, "groq: 429"), (dict.fromkeys(FIELDS), None)]
    body = client.post("/api/extract", json={"transcript": "hi"}).json()
    assert body["model"] == FALLBACK_MODEL
    assert body["fallback_reason"] == "groq: 429"


def test_extract_502_when_both_fail(llm):
    llm.replies = [(None, "a down"), (None, "b down")]
    r = client.post("/api/extract", json={"transcript": "hi"})
    assert r.status_code == 502
    assert r.json() == {"error": "b down"}


def test_extract_unknown_model():
    r = client.post("/api/extract", json={"transcript": "hi", "model": "nope"})
    assert r.status_code == 400
    assert "unknown model" in r.json()["error"]


def test_extract_invalid_body():
    assert client.post("/api/extract", json={"current": "not-an-object"}).status_code == 422


def test_ws_rejects_unknown_model():
    with client.websocket_connect("/ws/deepgram?model=nope") as ws:
        with pytest.raises(Exception) as e:
            ws.receive_text()
    assert getattr(e.value, "code", None) == 1008
