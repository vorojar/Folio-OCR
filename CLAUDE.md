# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Folio-OCR is a FastAPI-based OCR workbench powered by [GLM-OCR](https://huggingface.co/zai-org/GLM-OCR) via Ollama. It provides a three-column web UI and REST API for text recognition from images and PDFs.

## Commands

```bash
# Start server
python server.py

# Start with hot reload
uvicorn server:app --reload --host 0.0.0.0 --port 3000

# Install dependencies
pip install -r requirements.txt

# Windows quick start
start.bat
```

## Prerequisites

- [Ollama](https://ollama.com/) installed and `ollama` in PATH
- Pull the model: `ollama pull glm-ocr`

## Architecture

**Single-file backend** (`server.py`):
- FastAPI app with CORS enabled
- OCR inference via Ollama HTTP API (`/api/chat` with base64 images)
- Auto-starts Ollama if not running when "Load Model" is clicked
- PDF processing via PyMuPDF: converts pages to PNG at 2x resolution before OCR
- In-memory document state (`documents` dict) tracks uploaded files and OCR results
- Uploads stored in `uploads/{doc_id}/` subdirectories, cleaned on startup and deletion
- Path traversal protection via `_safe_doc_path()` helper

**Single-file frontend** (`index.html`):
- Three-column document workbench layout (page list | image preview | OCR result)
- Left panel: page thumbnails with OCR status indicators
- Center panel: full image preview (upload zone when no document loaded)
- Right panel: OCR text output with per-page and all-page copy
- Auto-triggers OCR when selecting a page; caches results client-side

**API Endpoints**:
- `GET /api/status` - Service status and Ollama connectivity
- `POST /api/load-model` - Start Ollama if needed, pre-warm model into GPU
- `POST /api/upload` - Upload one or more files (multi-select images supported), SSE stream page list
- `GET /api/images/{doc_id}/{filename}` - Serve uploaded page images
- `POST /api/ocr/{doc_id}/{page_num}` - Run OCR on a single page (returns cached if available)
- `POST /api/ocr/{doc_id}/all` - Run OCR on all pages sequentially
- `DELETE /api/documents/{doc_id}` - Delete document and its images

## Key Implementation Details

- Ollama model: `glm-ocr` on `localhost:11434`
- OCR prompt is hardcoded as `"Text Recognition:"`
- PDF pages rendered at 2x scale matrix for better OCR quality
- First request after model load takes ~50s (cold start), subsequent ~0.5s
