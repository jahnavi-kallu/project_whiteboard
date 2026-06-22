const mongoose = require("mongoose");

const canvasSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    shared: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Stores the canvas as a base64 PNG dataURL so it can be restored on load
    dataUrl: { type: String, default: "" },
    title: { type: String, default: "Untitled Canvas" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Canvas", canvasSchema);