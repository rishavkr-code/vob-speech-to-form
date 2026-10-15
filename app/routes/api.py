"""REST endpoints under /api."""

import time
from datetime import date

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import settings
from ..catalog import DEEPGRAM_MODELS, EXTRACT_MODEL, FIELDS, OPTIONS
from ..extract import ExtractError, extract
from ..schemas import ConfigResponse, Error, ExtractRequest, ExtractResponse, Health

router = APIRouter(prefix="/api")


@router.get("/health", response_model=Health)
async def health():
    """Liveness probe for the load balancer / host."""
    return Health()


@router.get("/config", response_model=ConfigResponse)
async def config():
    """Everything the UI needs to render the form and the speech-to-text model picker."""
    return ConfigResponse(
        options=OPTIONS,
        fields=FIELDS,
        stt_models=DEEPGRAM_MODELS,
        deepgram_configured=bool(settings.DEEPGRAM_API_KEY),
        anthropic_configured=bool(settings.ANTHROPIC_API_KEY),
    )


@router.post("/extract", response_model=ExtractResponse, responses={429: {"model": Error}, 502: {"model": Error}})
async def extract_fields(req: ExtractRequest):
    """Turn the transcript so far + the current form into the new form state."""
    t0 = time.perf_counter()
    try:
        fields = await extract(req.transcript, req.current, req.today or date.today())
    except ExtractError as e:
        return JSONResponse({"error": str(e)}, status_code=e.status_code)
    return ExtractResponse(fields=fields, ms=round((time.perf_counter() - t0) * 1000), model=EXTRACT_MODEL)
