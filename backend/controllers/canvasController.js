const Canvas = require("../models/canvasModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");

// Create a new canvas
exports.createCanvas = async (req, res) => {
    try {
        const userId = req.userId;
        const { title } = req.body;

        const newCanvas = new Canvas({
            owner:  userId,
            title:  title || `Canvas ${new Date().toLocaleDateString('en-GB')}`,
            shared: [],
            dataUrl: ""
        });

        await newCanvas.save();
        console.log(`✅ Canvas created: ${newCanvas._id} for user ${userId}`);

        res.status(201).json({
            message: "Canvas created successfully",
            canvas: {
                id:        newCanvas._id.toString(), // explicit string so frontend never gets ObjectId
                _id:       newCanvas._id.toString(),
                title:     newCanvas.title,
                createdAt: newCanvas.createdAt
            }
        });
    } catch (error) {
        console.error("createCanvas error:", error);
        res.status(500).json({ message: "Failed to create canvas", details: error.message });
    }
};

// Save/update canvas dataUrl
exports.updateCanvas = async (req, res) => {
    try {
        const { canvasId, dataUrl, title } = req.body;
        const userId = req.userId;

        if (!canvasId) return res.status(400).json({ message: "canvasId is required" });

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) return res.status(404).json({ message: "Canvas not found" });

        const isOwner  = canvas.owner.toString() === userId;
        const isShared = canvas.shared.map(id => id.toString()).includes(userId);
        if (!isOwner && !isShared) {
            return res.status(403).json({ message: "Unauthorized to update this canvas" });
        }

        if (dataUrl !== undefined) canvas.dataUrl = dataUrl;
        if (title)                 canvas.title   = title;

        await canvas.save(); // triggers timestamps.updatedAt automatically
        res.json({ message: "Canvas saved successfully" });
    } catch (error) {
        console.error("updateCanvas error:", error);
        res.status(500).json({ message: "Failed to save canvas", details: error.message });
    }
};

// Load a single canvas by ID
exports.loadCanvas = async (req, res) => {
    try {
        const canvasId = req.params.id;
        const userId   = req.userId;

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) return res.status(404).json({ message: "Canvas not found" });

        const isOwner  = canvas.owner.toString() === userId;
        const isShared = canvas.shared.map(id => id.toString()).includes(userId);
        if (!isOwner && !isShared) {
            return res.status(403).json({ message: "Unauthorized to access this canvas" });
        }

        res.json({
            id:        canvas._id,
            title:     canvas.title,
            dataUrl:   canvas.dataUrl,
            owner:     canvas.owner,
            shared:    canvas.shared,
            createdAt: canvas.createdAt,
            updatedAt: canvas.updatedAt
        });
    } catch (error) {
        console.error("loadCanvas error:", error);
        res.status(500).json({ message: "Failed to load canvas", details: error.message });
    }
};

// List all canvases for the logged-in user (owned + shared)
exports.getUserCanvases = async (req, res) => {
    try {
        const userId = req.userId;
        console.log(`📋 Listing canvases for user: ${userId}`);

        const canvases = await Canvas.find({
            $or: [
                { owner: new mongoose.Types.ObjectId(userId) },
                { shared: new mongoose.Types.ObjectId(userId) }
            ]
        })
        .select("_id title owner shared createdAt updatedAt")
        .sort({ updatedAt: -1 });

        console.log(`📋 Found ${canvases.length} canvases`);
        res.json(canvases);
    } catch (error) {
        console.error("getUserCanvases error:", error);
        res.status(500).json({ message: "Failed to fetch canvases", details: error.message });
    }
};

// Share canvas with a user by email
exports.shareCanvas = async (req, res) => {
    try {
        const { email }   = req.body;
        const canvasId    = req.params.id;
        const userId      = req.userId;

        if (!email) return res.status(400).json({ message: "Email is required" });

        const userToShare = await User.findOne({ email: email.toLowerCase().trim() });
        if (!userToShare) return res.status(404).json({ message: "No user found with that email" });

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) return res.status(404).json({ message: "Canvas not found" });

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
        console.error("shareCanvas error:", error);
        res.status(500).json({ message: "Failed to share canvas", details: error.message });
    }
};

// Remove a user from the shared list
exports.unshareCanvas = async (req, res) => {
    try {
        const { userIdToRemove } = req.body;
        const canvasId = req.params.id;
        const userId   = req.userId;

        if (!userIdToRemove) return res.status(400).json({ message: "userIdToRemove is required" });

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) return res.status(404).json({ message: "Canvas not found" });

        if (canvas.owner.toString() !== userId) {
            return res.status(403).json({ message: "Only the owner can unshare this canvas" });
        }

        const before = canvas.shared.length;
        canvas.shared = canvas.shared.filter(id => id.toString() !== userIdToRemove);
        if (canvas.shared.length === before) {
            return res.status(404).json({ message: "User was not in the shared list" });
        }

        await canvas.save();
        res.json({ message: "Canvas access removed successfully" });
    } catch (error) {
        console.error("unshareCanvas error:", error);
        res.status(500).json({ message: "Failed to unshare canvas", details: error.message });
    }
};

// Delete a canvas
exports.deleteCanvas = async (req, res) => {
    try {
        const canvasId = req.params.id;
        const userId   = req.userId;

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) return res.status(404).json({ message: "Canvas not found" });

        if (canvas.owner.toString() !== userId) {
            return res.status(403).json({ message: "Only the owner can delete this canvas" });
        }

        await Canvas.findByIdAndDelete(canvasId);
        res.json({ message: "Canvas deleted successfully" });
    } catch (error) {
        console.error("deleteCanvas error:", error);
        res.status(500).json({ message: "Failed to delete canvas", details: error.message });
    }
};