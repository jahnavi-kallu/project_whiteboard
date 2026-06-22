const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const connectToDB = require('./config/db');
const { Server } = require("socket.io");
const http = require("http");
const Canvas = require("./models/canvasModel");
const jwt = require("jsonwebtoken");
const SECRET_KEY = "your_secret_key";

const userRoutes = require("./routes/userRoutes");
const canvasRoutes = require("./routes/canvasRoutes");

const app = express();

// === 1. MIDDLEWARE MATRIX ALWAYS GOES FIRST ===
app.use(cors({
    origin: [
        "http://localhost:3000", 
        "http://localhost:5500", 
        "http://127.0.0.1:5501",
        "http://127.0.0.1:5500"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));
app.use(express.json());

// === 2. ROUTE REGISTRATIONS COMPILATION ===
app.use("/api/users", userRoutes);
app.use("/api/canvas", canvasRoutes); // Placed perfectly below JSON and CORS setups

// Database connection initializer
connectToDB();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000", 
        "http://localhost:5500", 
        "http://127.0.0.1:5501",
        "http://127.0.0.1:5500"
      ], 
      methods: ["GET", "POST"],
    },
});

let canvasData = {};

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);
  
    socket.on("joinCanvas", async ({ canvasId }) => {
        console.log("Joining canvas room state:", canvasId);
        try {
            // 1. Safe default fallback room bypass
            if (canvasId === "default-canvas") {
                socket.join(canvasId);
                console.log(`User ${socket.id} joined test room: ${canvasId}`);
                
                if (canvasData[canvasId]) {
                    socket.emit("loadCanvas", canvasData[canvasId]);
                } else {
                    socket.emit("loadCanvas", ""); 
                }
                return; 
            }

            // 2. Verified JWT Authorization verification routing block
            const authHeader = socket.handshake.headers.authorization;
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                console.log("No authorization token parsed on socket handshake connection.");
                setTimeout(() => {
                    socket.emit("unauthorized", { message: "Access Denied: No Token" });
                }, 100);
                return;
            }

            const token = authHeader.split(" ")[1];
            const decoded = jwt.verify(token, SECRET_KEY);
            const userId = decoded.userId;

            if (!mongoose.Types.ObjectId.isValid(canvasId)) {
                socket.emit("error", { message: "Invalid Canvas ID format." });
                return;
            }

            const canvas = await Canvas.findById(canvasId);
            
            // Unified safety check across your canvas workspace collection definitions
            const isOwner = String(canvas.owner) === String(userId);
            const isShared = (canvas.sharedUsers && canvas.sharedUsers.includes(userId)) || (canvas.shared && canvas.shared.includes(userId));

            if (!canvas || (!isOwner && !isShared)) {
                console.log("Unauthorized access rejection fired.");
                setTimeout(() => {
                    socket.emit("unauthorized", { message: "You are not authorized to join this canvas." });
                }, 100);
                return;
            }

            socket.join(canvasId);
            if (canvasData[canvasId]) {
                socket.emit("loadCanvas", canvasData[canvasId]);
            } else {
                socket.emit("loadCanvas", canvas.elements);
            }
        } catch (error) {
            console.error("Socket room join error:", error);
            socket.emit("error", { message: "An error occurred while joining the canvas." });
        }
    });

    // Real-Time Socket Pipe distribution layers
    socket.on("drawingUpdate", async ({ canvasId, elements }) => {
        try {
            canvasData[canvasId] = elements;
            socket.to(canvasId).emit("receiveDrawingUpdate", elements);
    
            if (mongoose.Types.ObjectId.isValid(canvasId)) {
                await Canvas.findByIdAndUpdate(canvasId, { elements }, { new: true, useFindAndModify: false });
            }
        } catch (error) {
            console.error("Drawing update save error:", error);
        }
    });
    
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

server.listen(5000, () => console.log("Server running on port 5000"));