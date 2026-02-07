// --- State ---
const state = {
    activeDocId: null,
    activeDocFilename: null,
    pages: [],
    activePageNum: null,
    modelLoaded: false,
    layoutModelLoaded: false,
    isLoadingModel: false,
    ocrRunning: false,
    ocrAbort: false,
    viewMode: 'edit',
    layoutEnabled: true,
    docs: [],  // [{doc_id, filename, page_count, ocr_count, created_at}]
};

// --- DOM refs ---
const $ = id => document.getElementById(id);
const topFilename = $('topFilename');
const statusDot = $('statusDot');
const statusText = $('statusText');
const loadModelBtn = $('loadModelBtn');
const newFileBtn = $('newFileBtn');
const layoutToggleWrap = $('layoutToggleWrap');
const layoutSwitch = $('layoutSwitch');
const ocrAllBtn = $('ocrAllBtn');
const exportWrap = $('exportWrap');
const exportBtn = $('exportBtn');
const exportMenu = $('exportMenu');
const copyAllBtn = $('copyAllBtn');
const ocrProgress = $('ocrProgress');
const ocrProgressBar = $('ocrProgressBar');
const panelLeft = $('panelLeft');
const pageList = $('pageList');
const panelCenter = $('panelCenter');
const uploadZone = $('uploadZone');
const previewContainer = $('previewContainer');
const previewWrap = $('previewWrap');
const previewImage = $('previewImage');
const bboxOverlay = $('bboxOverlay');
const panelRight = $('panelRight');
const resultBody = $('resultBody');
const resultTime = $('resultTime');
const resultToolbar = $('resultToolbar');
const viewToggle = $('viewToggle');
const reflowBtn = $('reflowBtn');
const reflowAllBtn = $('reflowAllBtn');
const copyPageBtn = $('copyPageBtn');
const fileInput = $('fileInput');
const searchWrap = $('searchWrap');
const searchToggle = $('searchToggle');
const searchInput = $('searchInput');
const searchInfo = $('searchInfo');
const searchPrev = $('searchPrev');
const searchNext = $('searchNext');
const docListSection = $('docListSection');
const docListHeader = $('docListHeader');
const docList = $('docList');
const docListCount = $('docListCount');
const docListToggle = $('docListToggle');
const resizeHandle = $('resizeHandle');
const toastContainer = $('toastContainer');

// --- Resize handle (drag to resize right panel) ---
{
    let startX, startWidth;

    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = panelRight.offsetWidth;
        resizeHandle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onDragEnd);
    });

    function onDrag(e) {
        const delta = startX - e.clientX;
        const newWidth = Math.min(Math.max(startWidth + delta, 280), window.innerWidth * 0.6);
        panelRight.style.width = newWidth + 'px';
    }

    function onDragEnd() {
        resizeHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onDragEnd);
    }
}

// --- Fetch with timeout ---
function fetchT(url, opts = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const existing = opts.signal;
    if (existing) existing.addEventListener('abort', () => controller.abort());
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...opts, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

// --- Toast notifications ---
function showToast(message, type = 'error', duration = 3500) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    toastContainer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, duration);
}

// --- Status polling ---
async function checkStatus() {
    try {
        const res = await fetchT('/api/status', {}, 5000);
        const data = await res.json();
        state.modelLoaded = data.model_loaded;
        state.layoutModelLoaded = data.layout_loaded;

        if (state.isLoadingModel) {
            // Don't override loading UI
            return;
        }

        if (!data.model_loaded) {
            statusDot.className = 'status-dot error';
            statusText.textContent = 'OCR model not found';
            loadModelBtn.style.display = 'none';
        } else if (!data.layout_loaded) {
            statusDot.className = 'status-dot loading';
            statusText.textContent = 'Layout not loaded';
            loadModelBtn.style.display = '';
        } else {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Ready';
            loadModelBtn.style.display = 'none';
        }
    } catch (e) {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Offline';
    }
}
checkStatus();
setInterval(checkStatus, 3000);

// --- Load model (shared logic) ---
let _modelLoadPromise = null;

async function ensureModelsLoaded() {
    if (state.layoutModelLoaded) return true;
    // If already loading, piggyback on existing request
    if (_modelLoadPromise) return _modelLoadPromise;

    _modelLoadPromise = (async () => {
        state.isLoadingModel = true;
        loadModelBtn.disabled = true;
        loadModelBtn.textContent = 'Loading...';
        statusDot.className = 'status-dot loading';
        statusText.textContent = 'Loading model...';

        const t0 = Date.now();
        const timer = setInterval(() => {
            const s = Math.round((Date.now() - t0) / 1000);
            statusText.textContent = `Loading model... ${s}s`;
            loadModelBtn.textContent = `Loading... ${s}s`;
        }, 1000);

        try {
            const res = await fetchT('/api/load-model', { method: 'POST' }, 180000);
            if (!res.ok) throw new Error('Load failed');
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            state.layoutModelLoaded = true;
            statusDot.className = 'status-dot online';
            statusText.textContent = `Ready (loaded ${elapsed}s)`;
            loadModelBtn.style.display = 'none';
            return true;
        } catch (e) {
            console.error('Load model failed:', e);
            statusDot.className = 'status-dot error';
            statusText.textContent = 'Load failed';
            return false;
        } finally {
            clearInterval(timer);
            state.isLoadingModel = false;
            loadModelBtn.disabled = false;
            loadModelBtn.textContent = 'Load Model';
            _modelLoadPromise = null;
        }
    })();
    return _modelLoadPromise;
}

loadModelBtn.addEventListener('click', () => ensureModelsLoaded());

// --- Layout toggle ---
layoutSwitch.addEventListener('click', () => {
    state.layoutEnabled = !state.layoutEnabled;
    layoutSwitch.classList.toggle('on', state.layoutEnabled);
    // Update bbox overlay visibility
    bboxOverlay.style.display = state.layoutEnabled ? '' : 'none';
});

// --- Stop batch OCR helper ---
function stopBatchOcr() {
    state.ocrAbort = true;
    if (_batchAbortController) _batchAbortController.abort();
    state.ocrRunning = false;
    ocrAllBtn.textContent = 'OCR All Pages';
    ocrAllBtn.classList.remove('danger');
    ocrProgress.style.display = 'none';
}

// --- Reset view state ---
function resetViewState() {
    state.activeDocId = null;
    state.activeDocFilename = null;
    state.pages = [];
    state.activePageNum = null;
    pageList.innerHTML = '';
    previewContainer.classList.remove('show');
    previewImage.src = '';
    bboxOverlay.innerHTML = '';
    resultBody.innerHTML = '<div class="result-placeholder">Select a page to view OCR result</div>';
    resultTime.style.display = 'none';
    resultToolbar.style.display = 'none';
}

// --- File upload ---
uploadZone.addEventListener('click', () => fileInput.click());
newFileBtn.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});
uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) uploadFiles(fileInput.files);
    fileInput.value = '';
});

panelCenter.addEventListener('dragover', e => {
    e.preventDefault();
    if (!uploadZone.classList.contains('hidden')) {
        uploadZone.classList.add('dragover');
    }
});
panelCenter.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
});

async function uploadFiles(fileList) {
    // Build FormData FIRST (before any await) — fileList may be a live
    // FileList reference that gets cleared when fileInput.value is reset
    const formData = new FormData();
    const label = fileList.length === 1 ? fileList[0].name : `${fileList.length} files`;
    for (const f of fileList) formData.append('files', f);

    if (state.ocrRunning) stopBatchOcr();
    resetViewState();
    topFilename.textContent = `Uploading ${label}...`;

    try {
        const res = await fetchT('/api/upload', { method: 'POST', body: formData }, 120000);
        if (!res.ok) {
            let msg = 'Upload failed';
            try {
                const err = await res.json();
                msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
            } catch (_) { msg = `HTTP ${res.status}`; }
            throw new Error(msg);
        }
        await handleUploadStream(res);
    } catch (e) {
        topFilename.textContent = 'Upload failed: ' + e.message;
        console.error(e);
    }
}

function initDoc(docId, filename) {
    state.activeDocId = docId;
    state.activeDocFilename = filename;
    state.pages = [];
    state.activePageNum = null;
    topFilename.textContent = filename;
    pageList.innerHTML = '';
    panelLeft.classList.remove('hidden');
    panelRight.classList.remove('hidden');
    resizeHandle.classList.remove('hidden');
    uploadZone.classList.add('hidden');
    layoutToggleWrap.style.display = '';
    ocrAllBtn.style.display = '';
    exportWrap.style.display = '';
    copyAllBtn.style.display = '';
    searchWrap.style.display = '';
    clearSearch();
    updateDocItemActiveState();
}

function addPage(page) {
    state.pages.push(page);
    appendPageThumb(page);
}

async function handleUploadStream(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
            const line = part.split('\n').find(l => l.startsWith('data: '));
            if (!line) continue;
            const evt = JSON.parse(line.slice(6));

            if (evt.type === 'init') {
                initDoc(evt.doc_id, evt.filename);
                // Add new doc to list at top
                state.docs.unshift({
                    doc_id: evt.doc_id,
                    filename: evt.filename,
                    page_count: 0,
                    ocr_count: 0,
                    created_at: new Date().toISOString(),
                });
                renderDocList();
            } else if (evt.type === 'page') {
                addPage(evt.page);
                // Update page count in doc list
                const docEntry = state.docs.find(d => d.doc_id === state.activeDocId);
                if (docEntry) {
                    docEntry.page_count = state.pages.length;
                    if (evt.page.ocr_text != null) docEntry.ocr_count++;
                    updateDocItemCounts(state.activeDocId, docEntry.page_count, docEntry.ocr_count);
                }
                if (state.pages.length === 1) selectPage(1);
            }
        }
    }
}

// --- Append a single thumbnail ---
function appendPageThumb(page) {
    const div = document.createElement('div');
    div.className = 'page-thumb' + (page.num === state.activePageNum ? ' active' : '');
    div.dataset.num = page.num;

    let sc = '', sl = 'Pending';
    if (page.ocr_text != null) { sc = 'done'; sl = `Done (${page.ocr_time}s)`; }

    div.innerHTML = `
                <img src="${page.image_url}" alt="Page ${page.num}" loading="lazy">
                <div class="page-thumb-info">
                    <div class="page-thumb-label">Page ${page.num}</div>
                    <div class="page-thumb-status ${sc}">${sl}</div>
                </div>
            `;
    div.addEventListener('click', () => selectPage(page.num));
    pageList.appendChild(div);
}

function renderPageList() {
    pageList.innerHTML = '';
    state.pages.forEach(page => appendPageThumb(page));
}

// --- Keyboard navigation (↑/↓ to switch pages) ---
document.addEventListener('keydown', (e) => {
    // Don't intercept when typing in textarea
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (!state.activeDocId || state.pages.length === 0) return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const idx = state.pages.findIndex(p => p.num === state.activePageNum);
        if (idx > 0) selectPage(state.pages[idx - 1].num);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const idx = state.pages.findIndex(p => p.num === state.activePageNum);
        if (idx < state.pages.length - 1) selectPage(state.pages[idx + 1].num);
    }
});

// --- Select page ---
async function selectPage(num) {
    // Save current editor content before switching
    saveCurrentEditor();

    state.activePageNum = num;

    pageList.querySelectorAll('.page-thumb').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.num) === num);
    });

    const page = state.pages.find(p => p.num === num);
    if (!page) return;

    previewContainer.classList.add('show');
    previewImage.src = page.image_url;
    // Render bbox overlay once image loads (needs natural dimensions)
    previewImage.onload = () => renderBboxOverlay(page.ocr_regions);

    if (page.ocr_text != null) {
        showEditor(page.ocr_text, page.ocr_time, page.ocr_regions);
        preOcrNext(num);
    } else {
        await runOcrForPage(page);
    }
}

// --- Save textarea edits back to state + server ---
function saveCurrentEditor() {
    const ta = resultBody.querySelector('.result-editor');
    if (ta && state.activePageNum != null) {
        const page = state.pages.find(p => p.num === state.activePageNum);
        if (page) {
            page.ocr_text = ta.value;
            // Flush any pending debounce and save immediately
            clearTimeout(_saveTimer);
            if (state.activeDocId) {
                saveTextToServer(state.activeDocId, state.activePageNum, ta.value);
            }
        }
    }
}

// --- Run OCR for a single page ---
async function runOcrForPage(page) {
    // Ensure models are loaded before OCR
    if (!state.layoutModelLoaded) {
        resultBody.innerHTML = '<div class="result-loading"><div class="spinner"></div>Loading model...</div>';
        resultTime.style.display = 'none';
        const ok = await ensureModelsLoaded();
        if (!ok) {
            resultBody.innerHTML = '<div class="result-error">Model loading failed</div>';
            return;
        }
    }

    resultBody.innerHTML = '<div class="result-loading"><div class="spinner"></div>Recognizing page ' + page.num + '...</div>';
    resultTime.style.display = 'none';

    const thumbStatus = pageList.querySelector(`.page-thumb[data-num="${page.num}"] .page-thumb-status`);
    if (thumbStatus) {
        thumbStatus.className = 'page-thumb-status running';
        thumbStatus.textContent = 'Running...';
    }

    try {
        const res = await fetchT(`/api/ocr/${state.activeDocId}/${page.num}?layout=${state.layoutEnabled}`, { method: 'POST' }, 120000);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'OCR failed');
        }
        const data = await res.json();

        page.ocr_text = data.text;
        page.ocr_regions = data.regions || [];
        page.ocr_time = data.time;

        if (thumbStatus) {
            thumbStatus.className = 'page-thumb-status done';
            thumbStatus.textContent = `Done (${data.time}s)`;
        }

        if (state.activePageNum === page.num) {
            renderBboxOverlay(page.ocr_regions);
            showEditor(data.text, data.time, page.ocr_regions);
        }

        // Update doc list badge
        updateDocOcrCount();

        // Pre-OCR next page in background
        preOcrNext(page.num);
    } catch (e) {
        const isTimeout = e.name === 'AbortError';
        if (thumbStatus) {
            thumbStatus.className = 'page-thumb-status error';
            thumbStatus.textContent = isTimeout ? 'Timeout' : 'Error';
        }
        if (state.activePageNum === page.num) {
            const msg = isTimeout ? 'OCR timed out — retry?' : `OCR failed: ${e.message}`;
            resultBody.innerHTML = `<div class="result-error">${msg}</div>`;
        }
        if (isTimeout) showToast('OCR timed out — retry?', 'error');
    }
}

// --- Background pre-OCR for next page ---
let _preOcrRunning = false;

async function preOcrNext(currentNum) {
    if (_preOcrRunning || state.ocrRunning || !state.layoutModelLoaded) return;

    const idx = state.pages.findIndex(p => p.num === currentNum);
    if (idx < 0 || idx >= state.pages.length - 1) return;

    const next = state.pages[idx + 1];
    if (next.ocr_text != null) return;

    _preOcrRunning = true;
    const thumbStatus = pageList.querySelector(`.page-thumb[data-num="${next.num}"] .page-thumb-status`);
    if (thumbStatus) {
        thumbStatus.className = 'page-thumb-status running';
        thumbStatus.textContent = 'Pre-OCR...';
    }

    try {
        const res = await fetchT(`/api/ocr/${state.activeDocId}/${next.num}?layout=${state.layoutEnabled}`, { method: 'POST' }, 120000);
        if (!res.ok) throw new Error('Pre-OCR failed');
        const data = await res.json();

        next.ocr_text = data.text;
        next.ocr_regions = data.regions || [];
        next.ocr_time = data.time;

        if (thumbStatus) {
            thumbStatus.className = 'page-thumb-status done';
            thumbStatus.textContent = `Done (${data.time}s)`;
        }

        // Update doc list badge
        updateDocOcrCount();

        // If user already navigated to this page while we were pre-OCR'ing, show the result
        if (state.activePageNum === next.num) {
            renderBboxOverlay(next.ocr_regions);
            showEditor(data.text, data.time, next.ocr_regions);
        }
    } catch (e) {
        // Reset thumbnail status so user sees "Pending" instead of stuck "Pre-OCR..."
        if (thumbStatus) {
            thumbStatus.className = 'page-thumb-status';
            thumbStatus.textContent = 'Pending';
        }
    } finally {
        _preOcrRunning = false;
    }
}

// --- Auto-save debounce ---
let _saveTimer = null;

function saveTextToServer(docId, pageNum, text) {
    fetchT(`/api/pages/${docId}/${pageNum}/text`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    }, 10000).catch(e => {
        console.warn('Auto-save failed:', e);
        showToast('Auto-save failed', 'warn');
    });
}

// --- Show editable textarea + preview ---
function showEditor(text, time, regions) {
    resultBody.innerHTML = '';

    const ta = document.createElement('textarea');
    ta.className = 'result-editor' + (state.viewMode !== 'edit' ? ' hidden' : '');
    ta.value = text || '';
    ta.placeholder = 'No text recognized';
    ta.addEventListener('input', () => {
        const page = state.pages.find(p => p.num === state.activePageNum);
        if (page) page.ocr_text = ta.value;
        // Debounced auto-save to server
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
            if (state.activeDocId && state.activePageNum != null) {
                saveTextToServer(state.activeDocId, state.activePageNum, ta.value);
            }
        }, 800);
    });
    resultBody.appendChild(ta);

    const preview = document.createElement('div');
    preview.className = 'result-preview' + (state.viewMode !== 'preview' ? ' hidden' : '');
    // If we have regions, render as clickable blocks; otherwise fallback
    if (regions && regions.length > 0) {
        preview.innerHTML = renderRegionBlocks(regions, _searchQuery);
    } else {
        preview.innerHTML = renderPreview(text || '', _searchQuery);
    }
    resultBody.appendChild(preview);

    resultToolbar.style.display = '';
    updateViewToggleButtons();

    if (time != null) {
        resultTime.textContent = time + 's';
        resultTime.style.display = '';
    } else {
        resultTime.style.display = 'none';
    }
}

// --- Render region blocks for preview with bidirectional highlighting ---
function renderRegionBlocks(regions, searchQuery) {
    return regions.map(r => {
        const rendered = renderPreview(r.text || '', searchQuery);
        return `<div class="region-block" data-idx="${r.idx}" onclick="highlightRegion(${r.idx})">${rendered}</div>`;
    }).join('');
}

// --- Render bbox overlay on image ---
function renderBboxOverlay(regions) {
    bboxOverlay.innerHTML = '';
    if (!regions || regions.length === 0) return;

    const img = previewImage;
    if (!img.naturalWidth) return;

    const scaleX = img.clientWidth / img.naturalWidth;
    const scaleY = img.clientHeight / img.naturalHeight;

    for (const r of regions) {
        const [x1, y1, x2, y2] = r.bbox;
        const div = document.createElement('div');
        div.className = 'bbox-rect';
        div.dataset.idx = r.idx;
        div.style.left = (x1 * scaleX) + 'px';
        div.style.top = (y1 * scaleY) + 'px';
        div.style.width = ((x2 - x1) * scaleX) + 'px';
        div.style.height = ((y2 - y1) * scaleY) + 'px';
        div.addEventListener('click', () => highlightRegion(r.idx));
        bboxOverlay.appendChild(div);
    }
}

// --- Bidirectional highlighting ---
function highlightRegion(idx) {
    // Clear previous highlights
    document.querySelectorAll('.bbox-rect.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.region-block.active').forEach(el => el.classList.remove('active'));

    // Highlight bbox on image
    const bbox = bboxOverlay.querySelector(`.bbox-rect[data-idx="${idx}"]`);
    if (bbox) bbox.classList.add('active');

    // Highlight text block and scroll into view
    const block = resultBody.querySelector(`.region-block[data-idx="${idx}"]`);
    if (block) {
        block.classList.add('active');
        block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // If in edit mode, switch to preview to show highlighting
    if (state.viewMode === 'edit') {
        state.viewMode = 'preview';
        updateViewToggleButtons();
        const ta = resultBody.querySelector('.result-editor');
        const preview = resultBody.querySelector('.result-preview');
        if (ta) ta.classList.add('hidden');
        if (preview) {
            preview.classList.remove('hidden');
            // Re-highlight after mode switch
            const b2 = preview.querySelector(`.region-block[data-idx="${idx}"]`);
            if (b2) {
                b2.classList.add('active');
                b2.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }
}
// Make highlightRegion available for inline onclick
window.highlightRegion = highlightRegion;

// --- Render markdown/HTML to preview HTML ---
function renderPreview(text, searchQuery) {
    if (!text) return '<span style="color:rgba(45,45,45,0.3)">No text recognized</span>';

    // Split by HTML block elements (tables) to preserve them
    // Process non-HTML parts as simple markdown
    const parts = text.split(/(<table[\s\S]*?<\/table>)/gi);
    let html = '';

    for (const part of parts) {
        if (part.match(/^<table[\s\S]*<\/table>$/i)) {
            // HTML table — pass through, then highlight text nodes
            html += searchQuery ? highlightHtml(part, searchQuery) : part;
        } else {
            // Process as simple markdown
            let rendered = markdownToHtml(part);
            if (searchQuery) rendered = highlightHtml(rendered, searchQuery);
            html += rendered;
        }
    }
    return html;
}

function markdownToHtml(text) {
    let html = '';
    const lines = text.split('\n');
    let inTable = false;
    let tableRows = [];

    function flushTable() {
        if (tableRows.length === 0) return;
        html += '<table>';
        for (let i = 0; i < tableRows.length; i++) {
            const cleanCells = tableRows[i].replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            // Skip separator row (---, :--:, etc.)
            if (cleanCells.every(c => /^[-:]+$/.test(c))) continue;
            const tag = i === 0 ? 'th' : 'td';
            html += '<tr>' + cleanCells.map(c => `<${tag}>${escHtml(c)}</${tag}>`).join('') + '</tr>';
        }
        html += '</table>';
        tableRows = [];
        inTable = false;
    }

    for (const line of lines) {
        const trimmed = line.trim();

        // Detect markdown table rows (contain |)
        if (trimmed.includes('|') && (trimmed.startsWith('|') || trimmed.match(/\w\s*\|/))) {
            inTable = true;
            tableRows.push(trimmed);
            continue;
        }

        if (inTable) flushTable();

        // Headers
        if (trimmed.startsWith('### ')) {
            html += `<h3>${escHtml(trimmed.slice(4))}</h3>`;
        } else if (trimmed.startsWith('## ')) {
            html += `<h2>${escHtml(trimmed.slice(3))}</h2>`;
        } else if (trimmed.startsWith('# ')) {
            html += `<h1>${escHtml(trimmed.slice(2))}</h1>`;
        } else if (trimmed === '') {
            html += '<br>';
        } else {
            // Inline: bold, italic
            let s = escHtml(trimmed);
            s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
            html += `<p>${s}</p>`;
        }
    }
    if (inTable) flushTable();
    return html;
}

function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- View toggle ---
viewToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === state.viewMode) return;

    if (state.viewMode === 'edit') saveCurrentEditor();

    state.viewMode = mode;
    updateViewToggleButtons();

    const ta = resultBody.querySelector('.result-editor');
    const preview = resultBody.querySelector('.result-preview');
    if (!ta || !preview) return;

    if (mode === 'edit') {
        ta.classList.remove('hidden');
        preview.classList.add('hidden');
    } else {
        // Refresh preview from current state
        const page = state.pages.find(p => p.num === state.activePageNum);
        if (page && page.ocr_regions && page.ocr_regions.length > 0) {
            preview.innerHTML = renderRegionBlocks(page.ocr_regions, _searchQuery);
        } else {
            preview.innerHTML = renderPreview(page ? page.ocr_text || '' : '', _searchQuery);
        }
        ta.classList.add('hidden');
        preview.classList.remove('hidden');
    }
});

function updateViewToggleButtons() {
    viewToggle.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === state.viewMode);
    });
}

// --- Paragraph reflow ---
// Terminal punctuation: line ends here intentionally
const TERMINAL_RE = /[。！？；…」』）】》!?\]);:：]$/;
// Lines that should never be merged with the previous line
const BLOCK_START_RE = /^(#{1,3}\s|[-*+]\s|\d+[.、]\s*|[|｜<]|\s*$)/;
// Lines that should never be merged with the next line
const BLOCK_END_RE = /^(#{1,3}\s|[-*+]\s|\d+[.、]\s*|[|｜])/;

function reflowText(text) {
    if (!text) return text;

    const lines = text.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // Blank line → preserve as paragraph separator
        if (trimmed === '') {
            result.push('');
            i++;
            continue;
        }

        // Block-level element (heading, list, table, HTML) → keep as-is
        if (BLOCK_START_RE.test(trimmed)) {
            result.push(line);
            i++;
            continue;
        }

        // Start accumulating a paragraph
        let para = trimmed;
        i++;

        while (i < lines.length) {
            const next = lines[i].trim();

            // Stop merging if: blank line, block element, or previous line had terminal punctuation
            if (next === '' || BLOCK_START_RE.test(next) || TERMINAL_RE.test(para)) {
                break;
            }

            // Decide joiner: space for Latin chars at boundary, nothing for CJK
            const lastChar = para.slice(-1);
            const firstChar = next.charAt(0);
            const cjk = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;
            const joiner = (cjk.test(lastChar) || cjk.test(firstChar)) ? '' : ' ';

            para += joiner + next;
            i++;
        }

        result.push(para);
    }

    return result.join('\n');
}

reflowBtn.addEventListener('click', () => {
    saveCurrentEditor();
    const page = state.pages.find(p => p.num === state.activePageNum);
    if (!page || !page.ocr_text) return;

    page.ocr_text = reflowText(page.ocr_text);

    // Update editor/preview
    const ta = resultBody.querySelector('.result-editor');
    if (ta) ta.value = page.ocr_text;
    const preview = resultBody.querySelector('.result-preview');
    if (preview) preview.innerHTML = renderPreview(page.ocr_text);

    // Save reflowed text to server
    if (state.activeDocId) {
        saveTextToServer(state.activeDocId, page.num, page.ocr_text);
    }

    reflowBtn.textContent = 'Done!';
    setTimeout(() => reflowBtn.textContent = 'Reflow', 1200);
});

reflowAllBtn.addEventListener('click', () => {
    saveCurrentEditor();
    let count = 0;
    for (const page of state.pages) {
        if (page.ocr_text) {
            page.ocr_text = reflowText(page.ocr_text);
            count++;
            // Save each reflowed page to server
            if (state.activeDocId) {
                saveTextToServer(state.activeDocId, page.num, page.ocr_text);
            }
        }
    }

    // Refresh current view
    const page = state.pages.find(p => p.num === state.activePageNum);
    if (page && page.ocr_text) {
        const ta = resultBody.querySelector('.result-editor');
        if (ta) ta.value = page.ocr_text;
        const preview = resultBody.querySelector('.result-preview');
        if (preview) preview.innerHTML = renderPreview(page.ocr_text);
    }

    reflowAllBtn.textContent = `${count} pages`;
    setTimeout(() => reflowAllBtn.textContent = 'Reflow All', 1500);
});

// --- Copy current page ---
copyPageBtn.addEventListener('click', () => {
    saveCurrentEditor();
    const page = state.pages.find(p => p.num === state.activePageNum);
    if (page && page.ocr_text) {
        navigator.clipboard.writeText(page.ocr_text);
        copyPageBtn.textContent = 'Copied!';
        setTimeout(() => copyPageBtn.textContent = 'Copy', 1500);
    }
});

// --- Copy all pages ---
copyAllBtn.addEventListener('click', () => {
    saveCurrentEditor();
    const md = buildMarkdown();
    if (md) {
        navigator.clipboard.writeText(md);
        copyAllBtn.textContent = 'Copied!';
        setTimeout(() => copyAllBtn.textContent = 'Copy All', 1500);
    }
});

// --- Build Markdown content ---
function buildMarkdown() {
    const pagesWithText = state.pages.filter(p => p.ocr_text);
    if (pagesWithText.length === 0) return '';

    const title = state.activeDocFilename || 'Document';

    if (pagesWithText.length === 1 && state.pages.length === 1) {
        return pagesWithText[0].ocr_text;
    }

    let md = `# ${title}\n\n`;
    for (const p of state.pages) {
        md += `## Page ${p.num}\n\n`;
        md += (p.ocr_text || '*(not recognized)*') + '\n\n';
    }
    return md.trim();
}

// --- Download blob helper ---
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// --- Export dropdown ---
exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('show');
});

document.addEventListener('click', () => exportMenu.classList.remove('show'));

exportMenu.addEventListener('click', async (e) => {
    const item = e.target.closest('.export-item');
    if (!item) return;
    e.stopPropagation();
    exportMenu.classList.remove('show');

    saveCurrentEditor();
    const fmt = item.dataset.fmt;
    const baseName = (state.activeDocFilename || 'document').replace(/\.[^.]+$/, '');

    if (fmt === 'docx') {
        // Server-side DOCX generation
        const pages = state.pages.map(p => ({ num: p.num, text: p.ocr_text || '' }));
        if (pages.every(p => !p.text)) return;
        // Extract title from first page's layout regions (label === "title")
        const firstPage = state.pages[0];
        const titleRegion = (firstPage && firstPage.ocr_regions || [])
            .find(r => r.label === 'title');
        const docTitle = titleRegion ? titleRegion.text.trim() : null;
        try {
            const res = await fetchT(`/api/export/${state.activeDocId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pages, title: docTitle }),
            }, 60000);
            if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
            downloadBlob(await res.blob(), baseName + '.docx');
        } catch (err) {
            console.error('DOCX export failed:', err);
            alert('DOCX export failed: ' + err.message);
        }
        return;
    }

    let blob, ext;

    if (fmt === 'md') {
        const md = buildMarkdown();
        if (!md) return;
        blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        ext = '.md';
    } else if (fmt === 'txt') {
        const txt = buildPlainText();
        if (!txt) return;
        blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        ext = '.txt';
    }

    if (!blob) return;
    downloadBlob(blob, baseName + ext);
});

// --- Build plain text ---
function buildPlainText() {
    const pagesWithText = state.pages.filter(p => p.ocr_text);
    if (pagesWithText.length === 0) return '';

    if (state.pages.length === 1) return state.pages[0].ocr_text || '';

    return state.pages.map(p => {
        const text = p.ocr_text || '(not recognized)';
        return `--- Page ${p.num} ---\n\n${text}`;
    }).join('\n\n\n');
}

// --- Format time remaining ---
function formatEta(seconds) {
    if (seconds < 60) return Math.round(seconds) + 's';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m + 'm' + (s > 0 ? s.toString().padStart(2, '0') + 's' : '');
}

// --- OCR all pages with progress ---
let _batchAbortController = null;

ocrAllBtn.addEventListener('click', async () => {
    if (!state.activeDocId) return;

    if (state.ocrRunning) {
        stopBatchOcr();
        return;
    }

    // Ensure models loaded before batch
    if (!state.layoutModelLoaded) {
        ocrAllBtn.disabled = true;
        const ok = await ensureModelsLoaded();
        ocrAllBtn.disabled = false;
        if (!ok) return;
    }

    state.ocrRunning = true;
    state.ocrAbort = false;
    ocrAllBtn.textContent = 'Stop';
    ocrAllBtn.classList.add('danger');

    const pending = state.pages.filter(p => p.ocr_text == null);
    const total = pending.length;
    let done = 0;
    let totalTime = 0;

    // Show progress bar
    ocrProgress.style.display = '';
    ocrProgressBar.style.width = '0%';

    for (const page of state.pages) {
        if (state.ocrAbort) break;
        if (page.ocr_text != null) continue;

        // Update button text with progress
        const eta = done > 0 ? formatEta((totalTime / done) * (total - done)) : '';
        ocrAllBtn.textContent = `Stop ${done}/${total}` + (eta ? ` ~${eta}` : '');

        const thumbStatus = pageList.querySelector(`.page-thumb[data-num="${page.num}"] .page-thumb-status`);
        if (thumbStatus) {
            thumbStatus.className = 'page-thumb-status running';
            thumbStatus.textContent = 'Running...';
        }

        if (state.activePageNum === page.num) {
            resultBody.innerHTML = '<div class="result-loading"><div class="spinner"></div>Recognizing page ' + page.num + '...</div>';
            resultTime.style.display = 'none';
        }

        _batchAbortController = new AbortController();

        try {
            const res = await fetchT(`/api/ocr/${state.activeDocId}/${page.num}?layout=${state.layoutEnabled}`, { method: 'POST', signal: _batchAbortController.signal }, 120000);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'OCR failed');
            }
            const data = await res.json();
            page.ocr_text = data.text;
            page.ocr_regions = data.regions || [];
            page.ocr_time = data.time;

            done++;
            totalTime += data.time || 0;

            // Update progress bar
            ocrProgressBar.style.width = Math.round((done / total) * 100) + '%';

            if (thumbStatus) {
                thumbStatus.className = 'page-thumb-status done';
                thumbStatus.textContent = `Done (${data.time}s)`;
            }

            if (state.activePageNum === page.num) {
                renderBboxOverlay(page.ocr_regions);
                showEditor(data.text, data.time, page.ocr_regions);
            }

            // Update doc list badge
            updateDocOcrCount();
        } catch (e) {
            // User-initiated stop: break immediately
            if (state.ocrAbort) {
                if (thumbStatus) {
                    thumbStatus.className = 'page-thumb-status';
                    thumbStatus.textContent = 'Pending';
                }
                break;
            }

            done++;
            ocrProgressBar.style.width = Math.round((done / total) * 100) + '%';

            const isTimeout = e.name === 'AbortError';
            if (thumbStatus) {
                thumbStatus.className = 'page-thumb-status error';
                thumbStatus.textContent = isTimeout ? 'Timeout' : 'Error';
            }
            if (state.activePageNum === page.num) {
                const msg = isTimeout ? 'OCR timed out' : `OCR failed: ${e.message}`;
                resultBody.innerHTML = `<div class="result-error">${msg}</div>`;
            }
        }
    }

    _batchAbortController = null;
    state.ocrRunning = false;
    state.ocrAbort = false;
    ocrAllBtn.textContent = 'OCR All Pages';
    ocrAllBtn.classList.remove('danger');

    // Hide progress bar after a short delay
    setTimeout(() => {
        ocrProgress.style.display = 'none';
        ocrProgressBar.style.width = '0%';
    }, 1500);
});
// --- Full-text search ---
let _searchMatches = [];  // [{pageNum, count}]
let _searchIdx = -1;     // current match index (which page in _searchMatches)
let _searchQuery = '';

// Ctrl+F or click icon opens search, Escape closes
function openSearch() {
    searchInput.classList.add('open');
    searchToggle.classList.add('active');
    searchInput.focus();
    searchInput.select();
}

searchToggle.addEventListener('click', () => {
    if (searchInput.classList.contains('open')) {
        clearSearch();
    } else {
        openSearch();
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && state.activeDocId) {
        e.preventDefault();
        openSearch();
    }
    if (e.key === 'Escape' && document.activeElement === searchInput) {
        clearSearch();
    }
});

searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (q.length === 0) {
        clearSearch(true);  // keep input open
        return;
    }
    runSearch(q);
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) navSearch(-1);
        else navSearch(1);
    }
});

searchPrev.addEventListener('click', () => navSearch(-1));
searchNext.addEventListener('click', () => navSearch(1));

function runSearch(query) {
    _searchQuery = query;
    _searchMatches = [];
    const lower = query.toLowerCase();

    for (const page of state.pages) {
        if (!page.ocr_text) continue;
        const text = page.ocr_text.toLowerCase();
        let count = 0, idx = 0;
        while ((idx = text.indexOf(lower, idx)) !== -1) {
            count++;
            idx += lower.length;
        }
        if (count > 0) _searchMatches.push({ pageNum: page.num, count });
    }

    // Update page list badges
    updateSearchBadges();

    const total = _searchMatches.reduce((s, m) => s + m.count, 0);
    if (_searchMatches.length > 0) {
        searchInfo.textContent = `${_searchMatches.length} pages · ${total} hits`;
        searchPrev.disabled = false;
        searchNext.disabled = false;
        // Auto-jump to first match if not already on a matching page
        const onMatch = _searchMatches.find(m => m.pageNum === state.activePageNum);
        if (!onMatch) {
            _searchIdx = 0;
            selectPage(_searchMatches[0].pageNum);
        } else {
            _searchIdx = _searchMatches.findIndex(m => m.pageNum === state.activePageNum);
            refreshSearchHighlight();
        }
    } else {
        searchInfo.textContent = 'No results';
        searchPrev.disabled = true;
        searchNext.disabled = true;
        _searchIdx = -1;
        refreshSearchHighlight();
    }
}

function navSearch(dir) {
    if (_searchMatches.length === 0) return;
    _searchIdx = (_searchIdx + dir + _searchMatches.length) % _searchMatches.length;
    const match = _searchMatches[_searchIdx];
    searchInfo.textContent = `${_searchIdx + 1}/${_searchMatches.length} pages`;
    selectPage(match.pageNum);
}

function clearSearch(keepOpen) {
    _searchQuery = '';
    _searchMatches = [];
    _searchIdx = -1;
    searchInfo.textContent = '';
    searchPrev.disabled = true;
    searchNext.disabled = true;
    if (!keepOpen) {
        searchInput.value = '';
        searchInput.classList.remove('open');
        searchToggle.classList.remove('active');
        searchInput.blur();
    }
    updateSearchBadges();
    refreshSearchHighlight();
}

function updateSearchBadges() {
    const thumbs = pageList.querySelectorAll('.page-thumb');
    thumbs.forEach(el => {
        const num = parseInt(el.dataset.num);
        const match = _searchMatches.find(m => m.pageNum === num);
        const badge = el.querySelector('.search-badge');

        if (_searchQuery) {
            el.classList.toggle('search-miss', !match);
            if (match) {
                if (!badge) {
                    const b = document.createElement('span');
                    b.className = 'search-badge';
                    b.textContent = match.count;
                    el.querySelector('.page-thumb-label').appendChild(b);
                } else {
                    badge.textContent = match.count;
                }
            } else if (badge) {
                badge.remove();
            }
        } else {
            el.classList.remove('search-miss');
            if (badge) badge.remove();
        }
    });
}

// Highlight search matches in the preview panel
function refreshSearchHighlight() {
    const preview = resultBody.querySelector('.result-preview');
    if (!preview || !_searchQuery) return;

    // Re-render preview with highlights
    const page = state.pages.find(p => p.num === state.activePageNum);
    if (!page) return;

    if (page.ocr_regions && page.ocr_regions.length > 0) {
        preview.innerHTML = renderRegionBlocks(page.ocr_regions, _searchQuery);
    } else {
        preview.innerHTML = renderPreview(page.ocr_text || '', _searchQuery);
    }
}

// Inject <mark> highlights into rendered HTML, only in text nodes (skip tags)
function highlightHtml(html, query) {
    if (!query) return html;
    const parts = html.split(/(<[^>]+>)/g);
    const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${esc})`, 'gi');
    for (let i = 0; i < parts.length; i++) {
        // Only process text nodes (not tags)
        if (!parts[i].startsWith('<')) {
            parts[i] = parts[i].replace(re, '<mark>$1</mark>');
        }
    }
    return parts.join('');
}

// --- Document list ---

// Collapse/expand doc list
docListHeader.addEventListener('click', (e) => {
    // Don't toggle when clicking the delete button inside a doc item
    if (e.target.closest('.doc-item-delete')) return;
    docListSection.classList.toggle('collapsed');
});

function renderDocList() {
    docList.innerHTML = '';
    docListCount.textContent = state.docs.length ? `(${state.docs.length})` : '';

    // Hide doc list + divider when only one document
    const showList = state.docs.length > 1;
    docListSection.style.display = showList ? '' : 'none';
    docListSection.nextElementSibling.style.display = showList ? '' : 'none'; // .panel-divider

    for (const doc of state.docs) {
        const div = document.createElement('div');
        div.className = 'doc-item' + (doc.doc_id === state.activeDocId ? ' active' : '');
        div.dataset.docId = doc.doc_id;

        const badgeText = doc.page_count > 0
            ? `${doc.ocr_count}/${doc.page_count}`
            : '';

        div.innerHTML = `
            <div class="doc-item-info">
                <div class="doc-item-name" title="${escHtml(doc.filename)}">${escHtml(doc.filename)}</div>
                <div class="doc-item-meta">
                    <span>${doc.page_count} page${doc.page_count !== 1 ? 's' : ''}</span>
                    ${badgeText ? `<span class="doc-item-badge">${badgeText}</span>` : ''}
                </div>
            </div>
            <button class="doc-item-delete" title="Delete">&times;</button>
        `;

        div.addEventListener('click', (e) => {
            if (e.target.closest('.doc-item-delete')) return;
            if (doc.doc_id !== state.activeDocId) switchDocument(doc.doc_id);
        });

        div.querySelector('.doc-item-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteDocument(doc.doc_id, doc.filename);
        });

        docList.appendChild(div);
    }
}

function updateDocItemActiveState() {
    docList.querySelectorAll('.doc-item').forEach(el => {
        el.classList.toggle('active', el.dataset.docId === state.activeDocId);
    });
}

function updateDocItemCounts(docId, pageCount, ocrCount) {
    const docEntry = state.docs.find(d => d.doc_id === docId);
    if (!docEntry) return;
    if (pageCount !== undefined) docEntry.page_count = pageCount;
    if (ocrCount !== undefined) docEntry.ocr_count = ocrCount;

    const el = docList.querySelector(`.doc-item[data-doc-id="${docId}"]`);
    if (!el) return;

    const meta = el.querySelector('.doc-item-meta');
    if (meta) {
        const badgeText = docEntry.page_count > 0
            ? `${docEntry.ocr_count}/${docEntry.page_count}`
            : '';
        meta.innerHTML = `
            <span>${docEntry.page_count} page${docEntry.page_count !== 1 ? 's' : ''}</span>
            ${badgeText ? `<span class="doc-item-badge">${badgeText}</span>` : ''}
        `;
    }
}

function updateDocOcrCount() {
    if (!state.activeDocId) return;
    const ocrDone = state.pages.filter(p => p.ocr_text != null).length;
    updateDocItemCounts(state.activeDocId, undefined, ocrDone);
}

async function fetchDocList() {
    try {
        const res = await fetchT('/api/documents', {}, 10000);
        if (!res.ok) return;
        state.docs = await res.json();
        renderDocList();
    } catch (e) {
        console.warn('fetchDocList failed:', e);
    }
}

async function switchDocument(docId) {
    if (state.ocrRunning) stopBatchOcr();

    // Save current editor
    saveCurrentEditor();

    try {
        const res = await fetchT(`/api/documents/${docId}`, {}, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const detail = await res.json();
        initDoc(detail.doc_id, detail.filename);
        for (const p of detail.pages) addPage(p);
        if (detail.pages.length) selectPage(detail.pages[0].num);
    } catch (e) {
        console.error('switchDocument failed:', e);
        showToast('Failed to load document', 'error');
    }
}

async function deleteDocument(docId, filename) {
    if (!confirm(`Delete "${filename}"?`)) return;

    try {
        await fetchT(`/api/documents/${docId}`, { method: 'DELETE' }, 10000);
    } catch (e) {
        console.error('Delete failed:', e);
        showToast('Delete failed', 'error');
        return;
    }

    // Remove from state
    state.docs = state.docs.filter(d => d.doc_id !== docId);
    renderDocList();

    if (docId === state.activeDocId) {
        // Switch to next available doc, or show empty state
        if (state.docs.length > 0) {
            await switchDocument(state.docs[0].doc_id);
        } else {
            resetViewState();
            topFilename.textContent = 'No document';
            panelLeft.classList.add('hidden');
            panelRight.classList.add('hidden');
            resizeHandle.classList.add('hidden');
            uploadZone.classList.remove('hidden');
            layoutToggleWrap.style.display = 'none';
            ocrAllBtn.style.display = 'none';
            exportWrap.style.display = 'none';
            copyAllBtn.style.display = 'none';
            searchWrap.style.display = 'none';
        }
    }
}

// --- Restore last document on page load ---
async function restoreLastDocument() {
    try {
        await fetchDocList();
        if (!state.docs.length) return;
        panelLeft.classList.remove('hidden');

        // Load the most recent document
        const latest = state.docs[0];
        const res = await fetchT(`/api/documents/${latest.doc_id}`, {}, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const detail = await res.json();

        initDoc(detail.doc_id, detail.filename);
        for (const p of detail.pages) addPage(p);
        if (detail.pages.length) selectPage(detail.pages[0].num);
    } catch (e) {
        console.warn('Restore failed:', e);
    }
}
restoreLastDocument();