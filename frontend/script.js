const API_BASE_URL = 'http://localhost:5000/api';
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

// UI Controls
const colorPicker = document.getElementById('colorPicker');
const lineWidthRange = document.getElementById('lineWidthRange');
const thicknessVal = document.getElementById('thicknessVal');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

// Tool Buttons
const toolBrush = document.getElementById('toolBrush');
const toolEraser = document.getElementById('toolEraser');
const toolLine = document.getElementById('toolLine');
const toolRect = document.getElementById('toolRect');
const toolCircle = document.getElementById('toolCircle');

// State
let currentTool = 'brush';
let isDrawing = false;
let startX = 0;
let startY = 0;
let historyStack = [];
let redoStack = [];

// Active canvas tracking (set after login or canvas selection)
let activeCanvasId = null;

// ─── Canvas Context ────────────────────────────────────────────────────────────

function initCanvasContext() {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
}

function saveCanvasState() {
    historyStack.push(canvas.toDataURL());
    redoStack = [];
}

function resizeCanvas() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    initCanvasContext();
    ctx.drawImage(tempCanvas, 0, 0);
}

function restoreState(dataUrl) {
    if (!dataUrl) return;
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
    };
}

// ─── Drawing ───────────────────────────────────────────────────────────────────

function getCoords(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function startDrawing(e) {
    isDrawing = true;
    const coords = getCoords(e);
    startX = coords.x;
    startY = coords.y;
    saveCanvasState();
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const { x: currentX, y: currentY } = getCoords(e);
    const thickness = lineWidthRange.value;
    const activeColor = colorPicker.value;

    if (['line', 'rect', 'circle'].includes(currentTool)) {
        restoreState(historyStack[historyStack.length - 1]);
    }

    ctx.lineWidth = thickness;

    if (currentTool === 'eraser') {
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
        startX = currentX; startY = currentY;
    } else if (currentTool === 'brush') {
        ctx.strokeStyle = activeColor;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
        startX = currentX; startY = currentY;
    } else if (currentTool === 'line') {
        setTimeout(() => {
            ctx.strokeStyle = activeColor;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
        }, 0);
    } else if (currentTool === 'rect') {
        setTimeout(() => {
            ctx.strokeStyle = activeColor;
            ctx.beginPath();
            ctx.rect(startX, startY, currentX - startX, currentY - startY);
            ctx.stroke();
        }, 0);
    } else if (currentTool === 'circle') {
        setTimeout(() => {
            ctx.strokeStyle = activeColor;
            ctx.beginPath();
            const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
            ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }, 0);
    }
}

function stopDrawing() {
    isDrawing = false;
    ctx.beginPath();
}

// ─── Tools ─────────────────────────────────────────────────────────────────────

const tools = [
    { node: toolBrush, name: 'brush' },
    { node: toolEraser, name: 'eraser' },
    { node: toolLine, name: 'line' },
    { node: toolRect, name: 'rect' },
    { node: toolCircle, name: 'circle' }
];

tools.forEach(t => {
    t.node.addEventListener('click', () => {
        tools.forEach(o => o.node.classList.remove('active'));
        t.node.classList.add('active');
        currentTool = t.name;
    });
});

lineWidthRange.addEventListener('input', (e) => {
    thicknessVal.textContent = e.target.value;
});

clearBtn.addEventListener('click', () => {
    if (confirm('Clear the entire whiteboard?')) {
        saveCanvasState();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});

// ─── Undo / Redo ───────────────────────────────────────────────────────────────

undoBtn.addEventListener('click', () => {
    if (historyStack.length > 0) {
        redoStack.push(canvas.toDataURL());
        historyStack.pop();
        if (historyStack.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
            restoreState(historyStack[historyStack.length - 1]);
        }
    }
});

redoBtn.addEventListener('click', () => {
    if (redoStack.length > 0) {
        const nextState = redoStack.pop();
        historyStack.push(nextState);
        restoreState(nextState);
    }
});

// ─── Save ──────────────────────────────────────────────────────────────────────
// Save locally always; also persist to backend if logged in

saveBtn.addEventListener('click', async () => {
    // 1. Always allow local PNG download
    const link = document.createElement('a');
    link.download = `whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();

    // 2. If logged in, also save to the backend
    const token = localStorage.getItem('token');
    if (!token || !activeCanvasId) return;

    try {
        const response = await fetch(`${API_BASE_URL}/canvas/update`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ canvasId: activeCanvasId, dataUrl: canvas.toDataURL() })
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Cloud save failed:', data.message);
        }
    } catch (err) {
        console.error('Cloud save error:', err);
    }
});

// ─── Canvas Pointer Events ─────────────────────────────────────────────────────

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);
canvas.addEventListener('touchstart', startDrawing);
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDrawing);
window.addEventListener('resize', resizeCanvas);

// ─── Auth Modal ────────────────────────────────────────────────────────────────

const authModalBtn = document.getElementById('authModalBtn');
const authModal = document.getElementById('authModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function closeModal() { authModal.classList.remove('open'); }

closeModalBtn.addEventListener('click', closeModal);
authModal.addEventListener('click', (e) => { if (e.target === authModal) closeModal(); });

// If already logged in, clicking the button logs out instead of opening the modal
authModalBtn.addEventListener('click', () => {
    const token = localStorage.getItem('token');
    if (token) {
        if (confirm('Log out?')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            activeCanvasId = null;
            authModalBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Login / Register`;
        }
    } else {
        authModal.classList.add('open');
    }
});

tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
});

tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
});

// ─── API Helpers ───────────────────────────────────────────────────────────────

// Creates a new blank canvas on the backend and sets it as active
// --- Inside script.js ---
async function createNewCanvas() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert("You must be logged in to create a canvas.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/canvas/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: "Untitled Canvas",
                elements: []
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log("Canvas creation response data:", data);

            const canvasId = data.canvasId || data._id || data.id || (data.canvas && (data.canvas._id || data.canvas.id));
            
            if (canvasId) {
                // === FIX THE INFINITE LOOP HERE ===
                // Save the ID to storage so the page reload realizes it already has an active workspace!
                localStorage.setItem('activeCanvasId', canvasId);
                activeCanvasId = canvasId; 

                // Now it's perfectly safe to change search params
                window.location.search = `?room=${canvasId}`;
            } else {
                console.error("Canvas was created, but no ID key could be read from:", data);
                alert("Canvas created successfully, but your browser couldn't extract the unique room ID.");
            }
        }

    } catch (error) {
        console.error("Error encountered while communicating canvas creation route:", error);
    }
}
// Loads a saved canvas dataUrl from the backend and renders it
async function loadCanvas(canvasId, token) {
    try {
        const response = await fetch(`${API_BASE_URL}/canvas/load/${canvasId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok && data.dataUrl) {
            activeCanvasId = canvasId;
            restoreState(data.dataUrl);
        }
    } catch (err) {
        console.error('Failed to load canvas:', err);
    }
}

function applyLoggedInState(name, token) {
    authModalBtn.innerHTML = `<i class="fa-solid fa-user"></i> Hi, ${name}`;

    // Restore the last active canvas if one was saved, otherwise create a new one
    const savedCanvasId = localStorage.getItem('activeCanvasId');
    if (savedCanvasId) {
        loadCanvas(savedCanvasId, token);
    } else {
        createNewCanvas(token);
    }
}

// ─── Login ─────────────────────────────────────────────────────────────────────

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            const user = data.user;
            const displayName = user.name || user.username || email.split('@')[0];

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(user));

            closeModal();
            applyLoggedInState(displayName, data.token);
        } else {
            // Backend now always sends data.message
            alert(data.message || 'Login failed. Please check your credentials.');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Could not connect to the server. Is your backend running?');
    }
});

// ─── Register ──────────────────────────────────────────────────────────────────

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!name || !email || !password) {
        alert('All fields are required.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Account created! Please sign in.');
            tabLogin.click();
            // Pre-fill the email for convenience
            document.getElementById('loginEmail').value = email;
        } else {
            alert(data.message || 'Registration failed.');
        }
    } catch (error) {
        console.error('Register error:', error);
        alert('Could not connect to the server. Is your backend running?');
    }
});

// ─── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    resizeCanvas();

    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token');

    if (savedUser && savedToken) {
        const user = JSON.parse(savedUser);
        const displayName = user.name || user.username || '';
        applyLoggedInState(displayName || 'there', savedToken);
    }
});