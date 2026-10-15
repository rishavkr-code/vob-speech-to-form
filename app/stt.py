"""Deepgram live speech-to-text settings."""

from urllib.parse import urlencode

from .catalog import KEYTERMS, SAMPLE_RATE


def deepgram_params(model: str) -> list[tuple[str, str]]:
    params = [
        ("model", model),
        ("language", "en-US"),
        ("smart_format", "true"),
        ("punctuate", "true"),
        ("encoding", "linear16"),
        ("sample_rate", str(SAMPLE_RATE)),
        ("channels", "1"),
        ("interim_results", "true"),
        ("endpointing", "300"),
        ("utterance_end_ms", "1000"),
    ]
    if model.startswith("nova-3"):
        params += [("keyterm", t) for t in KEYTERMS]
    return params


def deepgram_live_url(model: str) -> str:
    return "wss://api.deepgram.com/v1/listen?" + urlencode(deepgram_params(model))
