
import express from "express";
import mongoose from "mongoose";

const router = express.Router();

router.get("/", (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  res.status(connected ? 200 : 503).json({
    success: connected,
    message: "EduConnect AI Backend API",
    database: connected ? "Connected" : "Disconnected",
    timestamp: new Date().toISOString()
  });
});

export default router;
