"""FastAPI app: wires routers, CORS and the demo UI. Run with `uvicorn app.main:app`."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import settings
from .clients import http
from .routes import api, stream


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await http.aclose()


app = FastAPI(title="VOB Audio API", version="0.1.0", lifespan=lifespan)

if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
    )

app.include_router(api.router)
app.include_router(stream.router)

if settings.SERVE_DEMO_UI:
    app.mount("/static", StaticFiles(directory=settings.STATIC), name="static")

    @app.get("/", include_in_schema=False)
    async def index():
        return FileResponse(settings.STATIC / "index.html")
