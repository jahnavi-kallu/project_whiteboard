const API_BASE_URL = 'http://localhost:5000/api';

// ─── Selectors ─────────────────────────────────────────────────────────────────
const canvas         = document.getElementById('whiteboard');
const ctx            = canvas.getContext('2d');
const colorPicker    = document.getElementById('colorPicker');
const lineWidthRange = document.getElementById('lineWidthRange');
const thicknessVal   = document.getElementById('thicknessVal');
const clearBtn       = document.getElementById('clearBtn');
const saveBtn        = document.getElementById('saveBtn');
const saveDropdown   = document.getElementById('saveDropdown');
const saveCloudBtn   = document.getElementById('saveCloudBtn');
const saveDownloadBtn= document.getElementById('saveDownloadBtn');
const undoBtn        = document.getElementById('undoBtn');
const redoBtn        = document.getElementById('redoBtn');
const canvasTitleEl  = document.getElementById('canvasTitle');
const authModalBtn   = document.getElementById('authModalBtn');
const toolBrush      = document.getElementById('toolBrush');
const toolEraser     = document.getElementById('toolEraser');
const toolLine       = document.getElementById('toolLine');
const toolRect       = document.getElementById('toolRect');
const toolCircle     = document.getElementById('toolCircle');
const myCanvasesBtn  = document.getElementById('myCanvasesBtn');
const canvasDrawer   = document.getElementById('canvasDrawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const newCanvasBtn   = document.getElementById('newCanvasBtn');
const canvasList     = document.getElementById('canvasList');
const shareBtn       = document.getElementById('shareBtn');
const shareModal     = document.getElementById('shareModal');
const closeShareBtn  = document.getElementById('closeShareModalBtn');
const shareEmail     = document.getElementById('shareEmail');
const shareSubmitBtn = document.getElementById('shareSubmitBtn');
const shareMsg       = document.getElementById('shareMsg');
const authModal      = document.getElementById('authModal');
const closeModalBtn  = document.getElementById('closeModalBtn');
const tabLogin       = document.getElementById('tabLogin');
const tabRegister    = document.getElementById('tabRegister');
const loginForm      = document.getElementById('loginForm');
const registerForm   = document.getElementById('registerForm');

// ─── State ─────────────────────────────────────────────────────────────────────
let currentTool    = 'brush';
let isDrawing      = false;
let startX = 0, startY = 0;
let historyStack   = [];
let redoStack      = [];
let activeCanvasId = null;
let socket         = null;

// ─── Helpers ───────────────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem('token');

function syncCanvasId() {
    if (!activeCanvasId) activeCanvasId = localStorage.getItem('activeCanvasId');
}

function setCanvasTitle(title) {
    canvasTitleEl.textContent   = title || '';
    canvasTitleEl.style.display = title ? 'inline-block' : 'none';
}

function resetSaveBtn() {
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save <i class="fa-solid fa-chevron-down save-chevron"></i>';
    saveBtn.disabled  = false;
}

async function apiFetch(path, options = {}) {
    return fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}`, ...options.headers }
    });
}

// ─── Canvas ────────────────────────────────────────────────────────────────────
function initCtx() { ctx.lineJoin = ctx.lineCap = 'round'; }

function resizeCanvas() {
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width; tmp.height = canvas.height;
    tmp.getContext('2d').drawImage(canvas, 0, 0);
    canvas.width  = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    initCtx(); ctx.drawImage(tmp, 0, 0);
}

function restoreState(dataUrl) {
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
    img.src = dataUrl;
}

function pushHistory() { historyStack.push(canvas.toDataURL()); redoStack = []; }

// ─── Drawing ───────────────────────────────────────────────────────────────────
function getCoords(e) {
    const r = canvas.getBoundingClientRect();
    const s = e.touches ? e.touches[0] : e;
    return { x: s.clientX - r.left, y: s.clientY - r.top };
}

function startDrawing(e) {
    isDrawing = true;
    ({ x: startX, y: startY } = getCoords(e));
    pushHistory();
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const { x: cx, y: cy } = getCoords(e);
    ctx.lineWidth    = lineWidthRange.value;
    ctx.strokeStyle  = currentTool === 'eraser' ? '#ffffff' : colorPicker.value;

    if (['line', 'rect', 'circle'].includes(currentTool))
        restoreState(historyStack[historyStack.length - 1]);

    ctx.beginPath();
    if (currentTool === 'brush' || currentTool === 'eraser') {
        ctx.moveTo(startX, startY); ctx.lineTo(cx, cy); ctx.stroke();
        startX = cx; startY = cy;
    } else if (currentTool === 'line') {
        ctx.moveTo(startX, startY); ctx.lineTo(cx, cy); ctx.stroke();
    } else if (currentTool === 'rect') {
        ctx.rect(startX, startY, cx - startX, cy - startY); ctx.stroke();
    } else if (currentTool === 'circle') {
        ctx.arc(startX, startY, Math.hypot(cx - startX, cy - startY), 0, 2 * Math.PI); ctx.stroke();
    }
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false; ctx.beginPath();
    if (socket && activeCanvasId)
        socket.emit('drawingUpdate', { canvasId: activeCanvasId, dataUrl: canvas.toDataURL() });
}

// ─── Tools ─────────────────────────────────────────────────────────────────────
[{ node: toolBrush, name: 'brush' }, { node: toolEraser, name: 'eraser' },
 { node: toolLine,  name: 'line'  }, { node: toolRect,   name: 'rect'   },
 { node: toolCircle,name: 'circle'}].forEach(t => {
    t.node.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        t.node.classList.add('active');
        currentTool = t.name;
    });
});

lineWidthRange.addEventListener('input', e => { thicknessVal.textContent = e.target.value; });

clearBtn.addEventListener('click', () => {
    if (!confirm('Clear the whiteboard?')) return;
    pushHistory();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (socket && activeCanvasId)
        socket.emit('drawingUpdate', { canvasId: activeCanvasId, dataUrl: canvas.toDataURL() });
});

undoBtn.addEventListener('click', () => {
    if (!historyStack.length) return;
    redoStack.push(canvas.toDataURL()); historyStack.pop();
    historyStack.length ? restoreState(historyStack[historyStack.length - 1])
                        : ctx.clearRect(0, 0, canvas.width, canvas.height);
});

redoBtn.addEventListener('click', () => {
    if (!redoStack.length) return;
    const s = redoStack.pop(); historyStack.push(s); restoreState(s);
});

// ─── Save ──────────────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', e => { e.stopPropagation(); saveDropdown.classList.toggle('open'); });
document.addEventListener('click', () => saveDropdown.classList.remove('open'));

saveDownloadBtn.addEventListener('click', () => {
    saveDropdown.classList.remove('open');
    const a = document.createElement('a');
    a.download = `whiteboard-${Date.now()}.png`;
    a.href = canvas.toDataURL(); a.click();
});

saveCloudBtn.addEventListener('click', async () => {
    saveDropdown.classList.remove('open');
    if (!getToken()) { alert('Please log in first.'); return; }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

    try {
        // Step 1: get a valid activeCanvasId by any means
        syncCanvasId();
        console.log('[Save] activeCanvasId after sync:', activeCanvasId);

        if (!activeCanvasId) {
            console.log('[Save] No ID found, fetching list...');
            const listRes  = await apiFetch('/canvas/list');
            const listData = await listRes.json();
            console.log('[Save] List response:', listRes.status, listData);

            if (listRes.ok && Array.isArray(listData) && listData.length > 0) {
                activeCanvasId = String(listData[0]._id);
                localStorage.setItem('activeCanvasId', activeCanvasId);
                console.log('[Save] Using existing canvas:', activeCanvasId);
            } else {
                console.log('[Save] No canvases, creating new one...');
                await createCanvas();
                console.log('[Save] Created canvas:', activeCanvasId);
            }
        }

        if (!activeCanvasId) {
            alert('Could not get a canvas ID. Please refresh and try again.');
            resetSaveBtn(); return;
        }

        // Step 2: save
        console.log('[Save] Saving to canvasId:', activeCanvasId);
        const res  = await apiFetch('/canvas/update', {
            method: 'PUT',
            body: JSON.stringify({ canvasId: activeCanvasId, dataUrl: canvas.toDataURL() })
        });
        const data = await res.json();
        console.log('[Save] Update response:', res.status, data);

        if (res.ok) {
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
            setTimeout(resetSaveBtn, 2000);
            if (canvasDrawer.classList.contains('open')) renderCanvasList();
        } else if (res.status === 404) {
            // Canvas deleted — create fresh and retry once
            console.log('[Save] Canvas not found, creating new and retrying...');
            localStorage.removeItem('activeCanvasId'); activeCanvasId = null;
            await createCanvas();
            await apiFetch('/canvas/update', {
                method: 'PUT',
                body: JSON.stringify({ canvasId: activeCanvasId, dataUrl: canvas.toDataURL() })
            });
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
            setTimeout(resetSaveBtn, 2000);
        } else if (res.status === 401) {
            alert('Session expired. Please log out and log in again.');
            resetSaveBtn();
        } else {
            alert('Save failed: ' + (data.message || res.status));
            resetSaveBtn();
        }
    } catch (err) {
        console.error('[Save] Exception:', err);
        alert('Error: ' + err.message);
        resetSaveBtn();
    }
});

// ─── Socket ────────────────────────────────────────────────────────────────────
function connectSocket(token, canvasId) {
    if (socket) socket.disconnect();
    socket = io('http://localhost:5000', { extraHeaders: { Authorization: `Bearer ${token}` } });
    socket.on('connect',              () => socket.emit('joinCanvas', { canvasId }));
    socket.on('loadCanvas',           dataUrl => { if (dataUrl) restoreState(dataUrl); });
    socket.on('receiveDrawingUpdate', dataUrl => restoreState(dataUrl));
    socket.on('unauthorized',         d => console.warn('Socket:', d.message));
}

// ─── Canvas API ────────────────────────────────────────────────────────────────
async function createCanvas(title) {
    const res  = await apiFetch('/canvas/create', {
        method: 'POST',
        body: JSON.stringify({ title: title || `Canvas ${new Date().toLocaleDateString()}` })
    });
    const data = await res.json();
    console.log('[createCanvas] response:', res.status, data);
    if (res.ok) {
        // Backend returns _id (MongoDB), aliased as id in the response — handle both
        activeCanvasId = String(data.canvas.id || data.canvas._id);
        localStorage.setItem('activeCanvasId', activeCanvasId);
        setCanvasTitle(data.canvas.title);
        connectSocket(getToken(), activeCanvasId);
        console.log('[createCanvas] set activeCanvasId:', activeCanvasId);
    } else {
        console.error('[createCanvas] failed:', data);
    }
    return res.ok ? activeCanvasId : null;
}

async function loadCanvas(id) {
    const res  = await apiFetch('/canvas/load/' + id);
    const data = await res.json();
    if (res.ok) {
        activeCanvasId = String(id);
        localStorage.setItem('activeCanvasId', activeCanvasId);
        if (data.dataUrl) restoreState(data.dataUrl);
        setCanvasTitle(data.title || 'Untitled Canvas');
        connectSocket(getToken(), activeCanvasId);
        console.log('[loadCanvas] loaded:', activeCanvasId);
    } else {
        console.warn('[loadCanvas] failed to load', id, data.message, '— creating new canvas');
        localStorage.removeItem('activeCanvasId');
        activeCanvasId = null;
        await createCanvas();
    }
}

async function applyLoggedInState(name, token) {
    authModalBtn.innerHTML = '<i class="fa-solid fa-user"></i> Hi, ' + name + ' &nbsp;·&nbsp; <small>Logout</small>';
    try {
        const listRes  = await apiFetch('/canvas/list');
        const list     = await listRes.json();
        console.log('[applyLoggedInState] list:', listRes.status, list);

        if (listRes.ok && Array.isArray(list) && list.length > 0) {
            const savedId = localStorage.getItem('activeCanvasId');
            const match   = list.find(c => String(c._id) === String(savedId));
            const target  = match ? match._id : list[0]._id;
            console.log('[applyLoggedInState] loading canvas:', target);
            await loadCanvas(target);
        } else {
            console.log('[applyLoggedInState] no canvases, creating new');
            localStorage.removeItem('activeCanvasId');
            activeCanvasId = null;
            await createCanvas();
        }
    } catch(err) {
        console.error('[applyLoggedInState] error:', err);
        localStorage.removeItem('activeCanvasId');
        activeCanvasId = null;
        await createCanvas();
    }
    console.log('[applyLoggedInState] done. activeCanvasId:', activeCanvasId, 'localStorage:', localStorage.getItem('activeCanvasId'));
}

// ─── My Canvases Drawer ────────────────────────────────────────────────────────
function openDrawer()  { canvasDrawer.classList.add('open'); drawerBackdrop.classList.add('open'); renderCanvasList(); }
function closeDrawer() { canvasDrawer.classList.remove('open'); drawerBackdrop.classList.remove('open'); }

myCanvasesBtn.addEventListener('click',  openDrawer);
closeDrawerBtn.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);

newCanvasBtn.addEventListener('click', async () => {
    closeDrawer();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    historyStack = []; redoStack = [];
    await createCanvas();
});

async function renderCanvasList() {
    canvasList.innerHTML = '<p class="canvas-list-empty">Loading…</p>';
    const res  = await apiFetch('/canvas/list');
    const list = await res.json();
    if (!res.ok || !list.length) {
        canvasList.innerHTML = '<p class="canvas-list-empty">No canvases yet. Create one above!</p>';
        return;
    }

    const userId = JSON.parse(localStorage.getItem('user'))?.id;
    canvasList.innerHTML = '';

    // Bulk delete button if many empty canvases
    const empties = list.filter(c => !c.title || c.title.startsWith('Canvas ') || c.title === 'Untitled Canvas');
    if (empties.length > 2) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-danger';
        btn.style.cssText = 'width:100%;justify-content:center;margin-bottom:10px;font-size:0.8rem;padding:7px;';
        btn.innerHTML = '<i class="fa-solid fa-broom"></i> Delete All Empty Canvases';
        btn.onclick = () => bulkDeleteEmpty(list, userId);
        canvasList.appendChild(btn);
    }

    list.forEach(c => {
        const isOwner = String(c.owner) === String(userId);
        const isActive= String(c._id)   === String(activeCanvasId);
        const date    = new Date(c.updatedAt || c.createdAt).toLocaleDateString();
        const el      = document.createElement('div');
        el.className  = `canvas-item${isActive ? ' active-canvas' : ''}`;
        el.innerHTML  = `
            <div class="canvas-item-info">
                <div class="canvas-item-title">${c.title || 'Untitled Canvas'}</div>
                <div class="canvas-item-meta">${date}</div>
            </div>
            <span class="canvas-item-badge ${isOwner ? 'badge-owned' : 'badge-shared'}">${isOwner ? 'Mine' : 'Shared'}</span>
            ${isOwner ? '<button class="canvas-item-delete" title="Delete"><i class="fa-solid fa-trash-can"></i></button>' : ''}`;

        el.addEventListener('click', async e => {
            if (e.target.closest('.canvas-item-delete')) return;
            closeDrawer();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            historyStack = []; redoStack = [];
            await loadCanvas(c._id);
        });

        const del = el.querySelector('.canvas-item-delete');
        if (del) del.addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm('Delete this canvas permanently?')) return;
            const r = await apiFetch(`/canvas/delete/${c._id}`, { method: 'DELETE' });
            if (r.ok) {
                if (String(c._id) === String(activeCanvasId)) {
                    activeCanvasId = null; localStorage.removeItem('activeCanvasId');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    setCanvasTitle(''); await createCanvas();
                }
                renderCanvasList();
            }
        });
        canvasList.appendChild(el);
    });
}

async function bulkDeleteEmpty(list, userId) {
    if (!confirm('Delete all empty untitled canvases? Your active canvas is kept.')) return;
    const targets = list.filter(c => {
        const mine   = String(c.owner) === String(userId);
        const empty  = !c.title || c.title.startsWith('Canvas ') || c.title === 'Untitled Canvas';
        const active = String(c._id) === String(activeCanvasId);
        return mine && empty && !active;
    });
    await Promise.all(targets.map(c => apiFetch(`/canvas/delete/${c._id}`, { method: 'DELETE' })));
    renderCanvasList();
}

// ─── Share ─────────────────────────────────────────────────────────────────────
shareBtn.addEventListener('click', () => {
    if (!getToken()) { authModal.classList.add('open'); return; }
    shareMsg.textContent = ''; shareEmail.value = '';
    shareModal.classList.add('open');
});
closeShareBtn.addEventListener('click', () => shareModal.classList.remove('open'));
shareModal.addEventListener('click', e => { if (e.target === shareModal) shareModal.classList.remove('open'); });

shareSubmitBtn.addEventListener('click', async () => {
    const email = shareEmail.value.trim();
    if (!email) { shareMsg.style.color = '#ef4444'; shareMsg.textContent = 'Enter an email.'; return; }
    syncCanvasId();
    if (!activeCanvasId) { shareMsg.style.color = '#ef4444'; shareMsg.textContent = 'No active canvas.'; return; }
    shareSubmitBtn.disabled = true;
    shareMsg.style.color = '#64748b'; shareMsg.textContent = 'Sending…';
    const res  = await apiFetch(`/canvas/share/${activeCanvasId}`, { method: 'PUT', body: JSON.stringify({ email }) });
    const data = await res.json();
    shareMsg.style.color = res.ok ? '#16a34a' : '#ef4444';
    shareMsg.textContent = data.message;
    if (res.ok) shareEmail.value = '';
    shareSubmitBtn.disabled = false;
});

// ─── Auth ──────────────────────────────────────────────────────────────────────
function closeModal() { authModal.classList.remove('open'); }
closeModalBtn.addEventListener('click', closeModal);
authModal.addEventListener('click', e => { if (e.target === authModal) closeModal(); });

authModalBtn.addEventListener('click', () => {
    if (getToken()) {
        if (!confirm('Log out?')) return;
        ['token','user','activeCanvasId'].forEach(k => localStorage.removeItem(k));
        activeCanvasId = null;
        if (socket) { socket.disconnect(); socket = null; }
        setCanvasTitle('');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        authModalBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login / Register';
    } else {
        authModal.classList.add('open');
    }
});

tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active'); tabRegister.classList.remove('active');
    loginForm.classList.add('active'); registerForm.classList.remove('active');
});
tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active'); tabLogin.classList.remove('active');
    registerForm.classList.add('active'); loginForm.classList.remove('active');
});

loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const res  = await fetch(`${API_BASE_URL}/users/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        closeModal();
        await applyLoggedInState(data.user.name || email.split('@')[0], data.token);
    } else { alert(data.message || 'Login failed.'); }
});

registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name     = document.getElementById('regName').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    if (!name || !email || !password) { alert('All fields are required.'); return; }
    const res  = await fetch(`${API_BASE_URL}/users/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (res.ok) {
        alert('Account created! Please sign in.');
        tabLogin.click();
        document.getElementById('loginEmail').value = email;
    } else { alert(data.message || 'Registration failed.'); }
});

// ─── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    resizeCanvas();
    const user  = localStorage.getItem('user');
    const token = getToken();
    if (user && token) {
        const { name, username } = JSON.parse(user);
        await applyLoggedInState(name || username || 'there', token);
    }
});

window.addEventListener('resize', resizeCanvas);
canvas.addEventListener('mousedown',  startDrawing);
canvas.addEventListener('mousemove',  draw);
canvas.addEventListener('mouseup',    stopDrawing);
canvas.addEventListener('mouseout',   stopDrawing);
canvas.addEventListener('touchstart', startDrawing);
canvas.addEventListener('touchmove',  draw, { passive: false });
canvas.addEventListener('touchend',   stopDrawing);