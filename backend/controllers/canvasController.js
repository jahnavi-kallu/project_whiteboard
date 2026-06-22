const Canvas = require("../models/canvasModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");

// Create a new canvas
// --- Inside controllers/canvasController.js ---
const Canvas = require("../models/canvasModel"); // Verify this path matches your file structure

const createCanvas = async (req, res) => {
    try {
        // req.user.id or req.user.userId comes from your authMiddleware token decoding
        const userId = req.user.id || req.user.userId; 

        if (!userId) {
            return res.status(401).json({ message: "User identity not found in request authorization token" });
        }

        // 1. Instantiate the new canvas structure
        const newCanvas = new Canvas({
            name: req.body.name || "Untitled Canvas",
            owner: userId,
            elements: req.body.elements || [],
            sharedUsers: [] 
        });

        // 2. Save it to your MongoDB Database cluster
        const savedCanvas = await newCanvas.save();

        // 3. === CRITICAL CRASH FIX ===
        // Return the saved document so the frontend can read the auto-generated '_id'!
        return res.status(201).json(savedCanvas);

    } catch (error) {
        console.error("Database error inside createCanvas controller:", error);
        return res.status(500).json({ message: "Server error creating new canvas workspace." });
    }
};

module.exports = {
    createCanvas,
    // ... your other controller functions like updateCanvas, getUserCanvases, etc.
};

// Save/update canvas dataUrl (called when user clicks Save to Cloud)
exports.updateCanvas = async (req, res) => {
    try {
        const { canvasId, dataUrl, title } = req.body;
        const userId = req.userId;

        if (!canvasId) {
            return res.status(400).json({ message: "canvasId is required" });
        }

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
        }

        // Only owner or shared users can save
        if (canvas.owner.toString() !== userId && !canvas.shared.map(id => id.toString()).includes(userId)) {
            return res.status(403).json({ message: "Unauthorized to update this canvas" });
        }

        if (dataUrl) canvas.dataUrl = dataUrl;
        if (title) canvas.title = title;
        canvas.updatedAt = new Date();

        await canvas.save();
        res.json({ message: "Canvas saved successfully" });
    } catch (error) {
        res.status(500).json({ message: "Failed to save canvas", details: error.message });
    }
};

// Load a canvas by ID
exports.loadCanvas = async (req, res) => {
    try {
        const canvasId = req.params.id;
        const userId = req.userId;

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
        }

        if (canvas.owner.toString() !== userId && !canvas.shared.map(id => id.toString()).includes(userId)) {
            return res.status(403).json({ message: "Unauthorized to access this canvas" });
        }

        res.json({
            id: canvas._id,
            title: canvas.title,
            dataUrl: canvas.dataUrl,
            owner: canvas.owner,
            shared: canvas.shared,
            createdAt: canvas.createdAt,
            updatedAt: canvas.updatedAt
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to load canvas", details: error.message });
    }
};

// Share canvas with a user by email
exports.shareCanvas = async (req, res) => {
    try {
        const { email } = req.body;
        const canvasId = req.params.id;
        const userId = req.userId;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const userToShare = await User.findOne({ email });
        if (!userToShare) {
            return res.status(404).json({ message: "No user found with that email" });
        }

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
        }

        if (canvas.owner.toString() !== userId) {
            return res.status(403).json({ message: "Only the owner can share this canvas" });
        }

        const sharedUserId = new mongoose.Types.ObjectId(userToShare._id);

        if (canvas.owner.toString() === sharedUserId.toString()) {
            return res.status(400).json({ message: "You cannot share a canvas with yourself" });
        }

        const alreadyShared = canvas.shared.some(id => id.toString() === sharedUserId.toString());
        if (alreadyShared) {
            return res.status(400).json({ message: "Canvas is already shared with this user" });
        }

        canvas.shared.push(sharedUserId);
        await canvas.save();

        res.json({ message: `Canvas shared with ${userToShare.name} successfully` });
    } catch (error) {
        res.status(500).json({ message: "Failed to share canvas", details: error.message });
    }
};

// Remove a user from the shared list
exports.unshareCanvas = async (req, res) => {
    try {
        const { userIdToRemove } = req.body;
        const canvasId = req.params.id;
        const userId = req.userId;

        if (!userIdToRemove) {
            return res.status(400).json({ message: "userIdToRemove is required" });
        }

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
        }

        if (canvas.owner.toString() !== userId) {
            return res.status(403).json({ message: "Only the owner can unshare this canvas" });
        }

        const originalLength = canvas.shared.length;
        canvas.shared = canvas.shared.filter(id => id.toString() !== userIdToRemove);

        if (canvas.shared.length === originalLength) {
            return res.status(404).json({ message: "User was not in the shared list" });
        }

        await canvas.save();
        res.json({ message: "Canvas access removed successfully" });
    } catch (error) {
        res.status(500).json({ message: "Failed to unshare canvas", details: error.message });
    }
};

// Delete a canvas
exports.deleteCanvas = async (req, res) => {
    try {
        const canvasId = req.params.id;
        const userId = req.userId;

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
        }

        if (canvas.owner.toString() !== userId) {
            return res.status(403).json({ message: "Only the owner can delete this canvas" });
        }

        await Canvas.findByIdAndDelete(canvasId);
        res.json({ message: "Canvas deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete canvas", details: error.message });
    }
};

// List all canvases owned by or shared with the logged-in user
exports.getUserCanvases = async (req, res) => {
    try {
        const userId = req.userId;

        const canvases = await Canvas.find({
            $or: [{ owner: userId }, { shared: userId }]
        })
        .select("_id title owner createdAt updatedAt") // exclude heavy dataUrl from list
        .sort({ updatedAt: -1 });

        res.json(canvases);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch canvases", details: error.message });
    }
};