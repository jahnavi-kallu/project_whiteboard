const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
console.log("MONGO_URI =", process.env.MONGO_URI);
const connectToDB = require('./config/db');
const { Server } = require("socket.io");
const http = require("http");
const Canvas = require("./models/canvasModel");
const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

const userRoutes = require("./routes/userRoutes");
const canvasRoutes = require("./routes/canvasRoutes");

const app = express();

const ALLOWED_ORIGINS = [
  "https://whiteboard-kjr.onrender.com",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:5501"
];

// === MIDDLEWARE ===
app.use(cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

// Increase JSON limit to 10mb to handle canvas dataUrl payloads
app.use(express.json({ limit: "10mb" }));

// === ROUTES ===
app.use("/api/users", userRoutes);
app.use("/api/canvas", canvasRoutes);

// === DATABASE ===
connectToDB();

// === SOCKET.IO SERVER ===
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"]
    },
    // Allow large dataUrl payloads over socket too
    maxHttpBufferSize: 10 * 1024 * 1024
});

// In-memory cache: canvasId -> latest dataUrl
// Lets newly joined users get the current state instantly without a DB read
let canvasCache = {};

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // ── joinCanvas ──────────────────────────────────────────────────────────────
    socket.on("joinCanvas", async ({ canvasId }) => {
        try {
            // Allow unauthenticated users into a demo room
            if (canvasId === "default-canvas") {
                socket.join(canvasId);
                socket.emit("loadCanvas", canvasCache[canvasId] || "");
                return;
            }

            // Verify JWT from socket handshake
            const authHeader = socket.handshake.headers.authorization;
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                socket.emit("unauthorized", { message: "Access Denied: No token provided" });
                return;
            }

            let userId;
            try {
                const token = authHeader.split(" ")[1];
                const decoded = jwt.verify(token, SECRET_KEY);
                userId = decoded.userId;
            } catch (err) {
                socket.emit("unauthorized", { message: "Invalid or expired token" });
                return;
            }

            if (!mongoose.Types.ObjectId.isValid(canvasId)) {
                socket.emit("error", { message: "Invalid canvas ID" });
                return;
            }

            // Null-check canvas BEFORE accessing its properties
            const canvas = await Canvas.findById(canvasId);
            if (!canvas) {
                socket.emit("error", { message: "Canvas not found" });
                return;
            }

            const isOwner = String(canvas.owner) === String(userId);
            // Model uses canvas.shared (fixed — removed stale sharedUsers reference)
            const isShared = canvas.shared && canvas.shared.some(id => String(id) === String(userId));

            if (!isOwner && !isShared) {
                socket.emit("unauthorized", { message: "You are not authorized to join this canvas" });
                return;
            }

            socket.join(canvasId);
            console.log(`User ${socket.id} joined canvas: ${canvasId}`);

            // Send cached state if available, else load from DB
            const stateToSend = canvasCache[canvasId] || canvas.dataUrl || "";
            socket.emit("loadCanvas", stateToSend);

        } catch (error) {
            console.error("joinCanvas error:", error);
            socket.emit("error", { message: "An error occurred while joining the canvas" });
        }
    });

    // ── drawingUpdate ───────────────────────────────────────────────────────────
    // Receives a dataUrl from the drawing client, broadcasts to room, persists to DB
    socket.on("drawingUpdate", async ({ canvasId, dataUrl }) => {
        try {
            if (!dataUrl || !canvasId) return;

            // Update in-memory cache for fast delivery to new joiners
            canvasCache[canvasId] = dataUrl;

            // Broadcast to everyone else in the room (not the sender)
            socket.to(canvasId).emit("receiveDrawingUpdate", dataUrl);

            // Persist to DB (only for real canvas IDs, not the demo room)
            if (canvasId !== "default-canvas" && mongoose.Types.ObjectId.isValid(canvasId)) {
                await Canvas.findByIdAndUpdate(
                    canvasId,
                    { dataUrl, updatedAt: new Date() },
                    { new: true }
                );
            }
        } catch (error) {
            console.error("drawingUpdate error:", error);
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

server.listen(5000, () => console.log("Server running on port 5000"));