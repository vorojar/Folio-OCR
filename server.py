# -*- coding: utf-8 -*-
"""
Folio-OCR Server - Ollama Backend
Three-column document workbench
"""
import os
import uuid
import time
import asyncio
import base64
import logging
import shutil
import subprocess
import httpx
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
import json
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import re
import fitz  # PyMuPDF for PDF processing

# Setup logging
LOG_FILE = Path(__file__).parent / "server.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger.info(f"=== Server starting, log file: {LOG_FILE} ===")

app = FastAPI(title="Folio-OCR Service", version="3.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Ollama config
OLLAMA_BASE = "http://localhost:11434"
OLLAMA_MODEL = "glm-ocr"

# In-memory document state
# doc_id -> {filename, pages: [{num, filename, ocr_text, ocr_time}], created_at}
documents: dict[str, dict] = {}

# Shared httpx client
_http_client: httpx.AsyncClient | None = None


@app.on_event("startup")
async def startup_event():
    global _http_client
    _http_client = httpx.AsyncClient(timeout=httpx.Timeout(300.0))
    # Clean up orphan directories from previous runs
    for child in UPLOAD_DIR.iterdir():
        if child.is_dir() and child.name not in documents:
            logger.info(f"[cleanup] Removing orphan directory: {child}")
            shutil.rmtree(child, ignore_errors=True)


@app.on_event("shutdown")
async def shutdown_event():
    global _http_client
    if _http_client:
        await _http_client.aclose()


async def check_ollama() -> dict:
    """Check Ollama status and model availability"""
    try:
        resp = await _http_client.get(f"{OLLAMA_BASE}/api/tags", timeout=5.0)
        resp.raise_for_status()
        data = resp.json()
        models = [m["name"] for m in data.get("models", [])]
        has_model = any(OLLAMA_MODEL in m for m in models)
        return {"online": True, "model_loaded": has_model, "models": models}
    except Exception:
        return {"online": False, "model_loaded": False, "models": []}


async def ocr_image(image_path: str) -> str:
    """Run OCR on an image via Ollama API"""
    t0 = time.time()

    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")

    logger.info(f"[OCR] image encoded: {time.time() - t0:.2f}s")

    t1 = time.time()
    resp = await _http_client.post(
        f"{OLLAMA_BASE}/api/chat",
        json={
            "model": OLLAMA_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": "Text Recognition:",
                    "images": [image_b64],
                }
            ],
            "stream": False,
        },
    )
    resp.raise_for_status()
    result = resp.json()

    output_text = result.get("message", {}).get("content", "")
    tokens = result.get("eval_count", 0)
    logger.info(f"[OCR] ollama generate: {time.time() - t1:.2f}s, tokens: {tokens}")
    logger.info(f"[OCR] TOTAL: {time.time() - t0:.2f}s")

    # GLM-OCR wraps output in ```markdown ... ``` fences — strip them
    output_text = re.sub(r'^```\w*\n?', '', output_text.strip())
    output_text = re.sub(r'\n?```$', '', output_text.strip())
    return output_text.strip()


def pdf_to_images(pdf_path: str, output_dir: Path) -> list[str]:
    """Convert PDF pages to images in the specified directory"""
    output_dir.mkdir(parents=True, exist_ok=True)
    filenames = []
    mat = fitz.Matrix(2.0, 2.0)
    doc = fitz.open(pdf_path)

    for page_num, page in enumerate(doc):
        pix = page.get_pixmap(matrix=mat)
        filename = f"page_{page_num + 1:03d}.png"
        pix.save(str(output_dir / filename))
        filenames.append(filename)

    doc.close()
    return filenames


def _safe_doc_path(doc_id: str, filename: str = "") -> Path:
    """Build a path inside UPLOAD_DIR/{doc_id} with traversal protection"""
    doc_dir = (UPLOAD_DIR / doc_id).resolve()
    if not str(doc_dir).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(403, "Invalid document ID")
    if filename:
        file_path = (doc_dir / filename).resolve()
        if not str(file_path).startswith(str(doc_dir)):
            raise HTTPException(403, "Invalid filename")
        return file_path
    return doc_dir


# --- Endpoints ---

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve frontend page"""
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/api/status")
async def status():
    """Check service status"""
    ollama = await check_ollama()
    return {
        "status": "running",
        "model_loaded": ollama["model_loaded"],
        "device": "ollama",
        "gpu": {"name": f"Ollama ({OLLAMA_MODEL})"} if ollama["online"] else None,
    }


async def ensure_ollama_running() -> dict:
    """Start Ollama if not running, wait until ready"""
    ollama = await check_ollama()
    if ollama["online"]:
        return ollama

    logger.info("[ollama] Not running, attempting to start ollama serve...")
    try:
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        logger.info("[ollama] Popen launched, waiting for service...")
    except FileNotFoundError:
        logger.error("[ollama] 'ollama' command not found in PATH")
        raise HTTPException(500, "Ollama not found. Please install Ollama first.")
    except Exception as e:
        logger.error(f"[ollama] Failed to start: {e}", exc_info=True)
        raise HTTPException(500, f"Failed to start Ollama: {e}")

    for i in range(60):
        await asyncio.sleep(0.5)
        ollama = await check_ollama()
        if ollama["online"]:
            logger.info(f"[ollama] Started in {(i + 1) * 0.5:.1f}s")
            return ollama

    raise HTTPException(500, "Failed to start Ollama after 30s")


@app.post("/api/load-model")
async def load_model_endpoint():
    """Start Ollama if needed, then pre-warm model into GPU"""
    ollama = await ensure_ollama_running()

    if not ollama["model_loaded"]:
        raise HTTPException(500, f"Model '{OLLAMA_MODEL}' not found. Run: ollama pull {OLLAMA_MODEL}")

    try:
        t0 = time.time()
        await _http_client.post(
            f"{OLLAMA_BASE}/api/chat",
            json={"model": OLLAMA_MODEL, "messages": [{"role": "user", "content": "hi"}], "stream": False},
        )
        logger.info(f"[load_model] Warmup done: {time.time() - t0:.2f}s")
    except Exception as e:
        logger.warning(f"[load_model] Warmup failed: {e}")
    return {"success": True, "message": f"Model {OLLAMA_MODEL} loaded into GPU"}


ALLOWED_SUFFIXES = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.pdf'}


@app.post("/api/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    """Upload one or more files. Multiple images become pages of one document.
    Always streams pages via SSE so the frontend gets incremental updates."""
    if not files:
        raise HTTPException(400, "No files provided")

    for f in files:
        if Path(f.filename).suffix.lower() not in ALLOWED_SUFFIXES:
            raise HTTPException(400, f"Unsupported file type: {f.filename}")

    # Read all file contents upfront (before entering the generator)
    file_data: list[tuple[str, str, bytes]] = []  # (filename, suffix, content)
    for f in files:
        suffix = Path(f.filename).suffix.lower()
        content = await f.read()
        file_data.append((f.filename, suffix, content))

    doc_id = str(uuid.uuid4())
    doc_dir = UPLOAD_DIR / doc_id
    doc_dir.mkdir(parents=True, exist_ok=True)

    # Display name
    if len(file_data) == 1:
        display_name = file_data[0][0]
    else:
        display_name = f"{len(file_data)} files"

    documents[doc_id] = {
        "filename": display_name,
        "pages": [],
        "created_at": datetime.now().isoformat(),
    }

    async def generate():
        page_num = 0

        yield f"data: {json.dumps({'type': 'init', 'doc_id': doc_id, 'filename': display_name})}\n\n"

        for fname, suffix, content in file_data:
            if suffix == ".pdf":
                # Save PDF, extract pages
                pdf_path = doc_dir / f"src_{uuid.uuid4().hex[:8]}.pdf"
                with open(pdf_path, "wb") as fp:
                    fp.write(content)

                mat = fitz.Matrix(2.0, 2.0)
                doc = fitz.open(str(pdf_path))
                for fitz_page in doc:
                    page_num += 1
                    pix = fitz_page.get_pixmap(matrix=mat)
                    img_name = f"page_{page_num:03d}.png"
                    pix.save(str(doc_dir / img_name))

                    page_info = {
                        "num": page_num,
                        "filename": img_name,
                        "image_url": f"/api/images/{doc_id}/{img_name}",
                        "ocr_text": None,
                        "ocr_time": None,
                    }
                    documents[doc_id]["pages"].append(page_info)
                    yield f"data: {json.dumps({'type': 'page', 'page': page_info})}\n\n"
                    await asyncio.sleep(0)

                doc.close()
                pdf_path.unlink(missing_ok=True)
            else:
                # Single image
                page_num += 1
                img_name = f"page_{page_num:03d}{suffix}"
                with open(doc_dir / img_name, "wb") as fp:
                    fp.write(content)

                page_info = {
                    "num": page_num,
                    "filename": img_name,
                    "image_url": f"/api/images/{doc_id}/{img_name}",
                    "ocr_text": None,
                    "ocr_time": None,
                }
                documents[doc_id]["pages"].append(page_info)
                yield f"data: {json.dumps({'type': 'page', 'page': page_info})}\n\n"
                await asyncio.sleep(0)

        yield f"data: {json.dumps({'type': 'done', 'page_count': page_num})}\n\n"
        logger.info(f"[upload] {display_name} -> {doc_id}, {page_num} page(s)")

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/images/{doc_id}/{filename}")
async def get_image(doc_id: str, filename: str):
    """Serve an uploaded page image"""
    file_path = _safe_doc_path(doc_id, filename)
    if not file_path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(file_path, media_type="image/png")


@app.post("/api/ocr/{doc_id}/{page_num}")
async def ocr_single_page(doc_id: str, page_num: int):
    """Run OCR on a single page"""
    if doc_id not in documents:
        raise HTTPException(404, "Document not found")

    doc = documents[doc_id]
    page = None
    for p in doc["pages"]:
        if p["num"] == page_num:
            page = p
            break
    if page is None:
        raise HTTPException(404, f"Page {page_num} not found")

    # If already OCR'd, return cached result
    if page["ocr_text"] is not None:
        return {
            "doc_id": doc_id,
            "page_num": page_num,
            "text": page["ocr_text"],
            "time": page["ocr_time"],
            "cached": True,
        }

    image_path = _safe_doc_path(doc_id, page["filename"])
    if not image_path.exists():
        raise HTTPException(404, "Image file not found")

    try:
        t0 = time.time()
        text = await ocr_image(str(image_path))
        elapsed = round(time.time() - t0, 2)

        page["ocr_text"] = text
        page["ocr_time"] = elapsed

        return {
            "doc_id": doc_id,
            "page_num": page_num,
            "text": text,
            "time": elapsed,
            "cached": False,
        }
    except httpx.HTTPStatusError as e:
        detail = e.response.text
        logger.error(f"[OCR] Ollama error: {detail}", exc_info=True)
        raise HTTPException(500, f"OCR failed: {detail}")
    except Exception as e:
        logger.error(f"[OCR] Error: {e}", exc_info=True)
        raise HTTPException(500, f"OCR failed: {e}")


@app.post("/api/ocr/{doc_id}/all")
async def ocr_all_pages(doc_id: str):
    """Run OCR on all pages of a document"""
    if doc_id not in documents:
        raise HTTPException(404, "Document not found")

    doc = documents[doc_id]
    results = []

    for page in doc["pages"]:
        if page["ocr_text"] is not None:
            results.append({
                "page_num": page["num"],
                "text": page["ocr_text"],
                "time": page["ocr_time"],
                "cached": True,
            })
            continue

        image_path = _safe_doc_path(doc_id, page["filename"])
        try:
            t0 = time.time()
            text = await ocr_image(str(image_path))
            elapsed = round(time.time() - t0, 2)

            page["ocr_text"] = text
            page["ocr_time"] = elapsed

            results.append({
                "page_num": page["num"],
                "text": text,
                "time": elapsed,
                "cached": False,
            })
        except Exception as e:
            logger.error(f"[OCR] Page {page['num']} error: {e}", exc_info=True)
            results.append({
                "page_num": page["num"],
                "text": None,
                "time": None,
                "error": str(e),
            })

    return {
        "doc_id": doc_id,
        "filename": doc["filename"],
        "results": results,
    }


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document and its images"""
    if doc_id not in documents:
        raise HTTPException(404, "Document not found")

    doc_dir = _safe_doc_path(doc_id)
    if doc_dir.exists():
        shutil.rmtree(doc_dir, ignore_errors=True)

    del documents[doc_id]
    logger.info(f"[delete] Document {doc_id} removed")
    return {"success": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
