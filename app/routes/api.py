"""REST endpoints under /api."""

import time
from datetime import date

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import settings
from ..catalog import DEEPGRAM_MODELS, DEFAULT_EXTRACT_MODEL, EXTRACT_MODELS, FIELDS, OPTIONS
from ..extract import extract
from ..schemas import ConfigResponse, Error, ExtractRequest, ExtractResponse, Health

router = APIRouter(prefix="/api")


@router.get("/health", response_model=Health)
async def health():
    """Liveness probe for the load balancer / host."""
    return Health()


@router.get("/config", response_model=ConfigResponse)
async def config():
    """Everything the UI needs to render the form and the model pickers."""
    return ConfigResponse(
        options=OPTIONS,
        fields=FIELDS,
        stt_models=DEEPGRAM_MODELS,
        extract_models=list(EXTRACT_MODELS),
        deepgram_configured=bool(settings.DEEPGRAM_API_KEY),
        openrouter_configured=bool(settings.OPENROUTER_API_KEY),
    )


@router.post("/extract", response_model=ExtractResponse, responses={400: {"model": Error}, 502: {"model": Error}})
async def extract_fields(req: ExtractRequest):
    """Turn the transcript so far + the current form into the new form state."""
    model = req.model or DEFAULT_EXTRACT_MODEL
    if model not in EXTRACT_MODELS:
        return JSONResponse({"error": f"unknown model {model}"}, status_code=400)
    t0 = time.perf_counter()
    fields, model, fallback_reason, err = await extract(req.transcript, req.current, model, req.today or date.today())
    if err:
        return JSONResponse({"error": err}, status_code=502)
    return ExtractResponse(
        fields=fields, ms=round((time.perf_counter() - t0) * 1000), model=model, fallback_reason=fallback_reason
    )
