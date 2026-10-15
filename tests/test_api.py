"""Route tests. The Claude call is stubbed, so these run offline and without API keys."""

import pytest
from fastapi.testclient import TestClient

from app import extract as extract_mod
from app.catalog import EXTRACT_MODEL, FIELDS
from app.extract import ExtractError
from app.main import app

client = TestClient(app)


@pytest.fixture
def llm(monkeypatch):
    """Replace the Claude call; set `llm.reply` to a dict (returned) or an ExtractError (raised)."""
    stub = type("Stub", (), {"reply": None, "prompts": []})()

    async def fake(user):
        stub.prompts.append(user)
        if isinstance(stub.reply, Exception):
            raise stub.reply
        return stub.reply

    monkeypatch.setattr(extract_mod, "call_llm", fake)
    return stub


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_config_lists_fields_and_models():
    body = client.get("/api/config").json()
    assert set(body["fields"]) == set(FIELDS)
    assert body["stt_models"] == ["nova-3", "nova-3-medical"]
    assert "anthropic_configured" in body


def test_extract_returns_normalized_fields(llm):
    llm.reply = {**dict.fromkeys(FIELDS), "last_name": "QUEZADA", "insurance_provider": "united"}
    r = client.post("/api/extract", json={"transcript": "last name quezada", "today": "2026-10-15"})
    assert r.status_code == 200
    body = r.json()
    assert body["fields"]["last_name"] == "Quezada"
    assert body["fields"]["insurance_provider"] == "UnitedHealthcare"
    assert body["model"] == EXTRACT_MODEL
    assert "Today's date: 2026-10-15" in llm.prompts[0]


def test_extract_upstream_error_is_502(llm):
    llm.reply = ExtractError("Anthropic API error 500: boom")
    r = client.post("/api/extract", json={"transcript": "hi"})
    assert r.status_code == 502
    assert r.json() == {"error": "Anthropic API error 500: boom"}


def test_extract_rate_limit_is_429(llm):
    llm.reply = ExtractError("rate limited by Anthropic: slow down", 429)
    assert client.post("/api/extract", json={"transcript": "hi"}).status_code == 429


def test_extract_invalid_body():
    assert client.post("/api/extract", json={"current": "not-an-object"}).status_code == 422


def test_ws_rejects_unknown_model():
    with client.websocket_connect("/ws/deepgram?model=nope") as ws:
        with pytest.raises(Exception) as e:
            ws.receive_text()
    assert getattr(e.value, "code", None) == 1008
