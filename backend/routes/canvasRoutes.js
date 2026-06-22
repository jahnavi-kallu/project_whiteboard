const express = require("express");
const {
    createCanvas,
    updateCanvas,
    loadCanvas,
    shareCanvas,
    unshareCanvas,
    deleteCanvas,
    getUserCanvases
} = require("../controllers/canvasController");
const { authMiddleware } = require("../middlewares/authMiddleware");

const router = express.Router();

// All canvas routes require authentication
router.get("/list", authMiddleware, getUserCanvases);
router.post("/create", authMiddleware, createCanvas);
router.put("/update", authMiddleware, updateCanvas);
router.get("/load/:id", authMiddleware, loadCanvas);
router.put("/share/:id", authMiddleware, shareCanvas);
router.put("/unshare/:id", authMiddleware, unshareCanvas);
router.delete("/delete/:id", authMiddleware, deleteCanvas);

module.exports = router;