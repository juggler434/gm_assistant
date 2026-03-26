"""Speaker diarization service using pyannote-audio."""

import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

logger = logging.getLogger("diarization")

# Loaded at startup, not lazily
_pipeline = None


def load_pipeline():
    global _pipeline
    from pyannote.audio import Pipeline

    token = os.environ.get("HF_TOKEN")
    if not token:
        raise RuntimeError(
            "HF_TOKEN environment variable is not set. "
            "A Hugging Face token is required to download the pyannote model."
        )

    logger.info("Downloading and loading pyannote pipeline...")
    _pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=token,
    )

    if _pipeline is None:
        raise RuntimeError(
            "Pipeline.from_pretrained returned None. "
            "Ensure you have accepted the license at "
            "https://huggingface.co/pyannote/speaker-diarization-3.1 "
            "and that your HF_TOKEN is valid."
        )
    logger.info("Pipeline loaded successfully.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_pipeline()
    yield


app = FastAPI(title="GM Assistant Diarization Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": _pipeline is not None}


@app.post("/diarize")
async def diarize(file: UploadFile = File(...)):
    """Accept an audio file and return speaker-labeled time segments."""
    if _pipeline is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Model not loaded yet"},
        )

    contents = await file.read()

    with tempfile.TemporaryDirectory() as tmp:
        ext = Path(file.filename or "audio.webm").suffix or ".webm"
        input_path = Path(tmp) / f"audio{ext}"
        input_path.write_bytes(contents)

        try:
            diarization = _pipeline(str(input_path))
        except Exception as e:
            return JSONResponse(
                status_code=422,
                content={"error": f"Diarization failed: {str(e)}"},
            )

    speakers = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        speakers.append({
            "speaker": speaker,
            "start": round(turn.start, 3),
            "end": round(turn.end, 3),
        })

    return {"speakers": speakers}
