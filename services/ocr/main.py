"""OCR service for scanned PDF processing using ocrmypdf."""

import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import Response

app = FastAPI(title="GM Assistant OCR Service")

OCR_TIMEOUT_SECONDS = 300


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_pdf(file: UploadFile = File(...)):
    """Accept a PDF, run ocrmypdf, return the OCR'd PDF."""
    contents = await file.read()

    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / "input.pdf"
        output_path = Path(tmp) / "output.pdf"

        input_path.write_bytes(contents)

        result = subprocess.run(
            [
                "ocrmypdf",
                "--skip-text",
                "--optimize", "1",
                "--quiet",
                str(input_path),
                str(output_path),
            ],
            capture_output=True,
            timeout=OCR_TIMEOUT_SECONDS,
        )

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")
            return Response(
                content=f"ocrmypdf failed (exit {result.returncode}): {stderr}",
                status_code=422,
                media_type="text/plain",
            )

        ocr_bytes = output_path.read_bytes()

    return Response(content=ocr_bytes, media_type="application/pdf")
