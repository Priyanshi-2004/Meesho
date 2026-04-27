const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI);

const User = require("./models/User");

let otpStore = {};
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-for-meesho-optimizer";

// Email config
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// 🔹 ADMIN: Get all users
app.get("/admin/users", async (req, res) => {
    try {
        const users = await User.find().sort({ _id: -1 });
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching users" });
    }
});

// 🔹 ADMIN: Add user
app.post("/admin/add-user", async (req, res) => {
    const email = (req.body.email || "").trim().toLowerCase();
    const plan = req.body.plan || "paid";
    const expiry = req.body.expiry ? new Date(req.body.expiry) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).json({ success: false, message: "User already exists" });
    }

    const user = new User({
        email,
        isActive: true,
        plan,
        expiry
    });

    await user.save();
    res.json({ success: true });
});

// 🔹 ADMIN: Toggle user status
app.post("/admin/toggle-status", async (req, res) => {
    const { email, isActive } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isActive = isActive;
    await user.save();

    res.json({ success: true });
});


// 🔹 CHECK USER ACCESS via JWT (IMPORTANT)
app.post("/check-user", async (req, res) => {
    const { email, deviceId } = req.body;

    const user = await User.findOne({ email });

    // ❌ User not found
    if (!user) {
        return res.json({
            access: false,
            message: "This email is not registered. Please purchase access."
        });
    }

    // ❌ Not active
    if (!user.isActive) {
        return res.json({
            access: false,
            message: "Your access is inactive. Contact support."
        });
    }

    // 🔒 Device binding
    if (!user.deviceId) {
        user.deviceId = deviceId;
        await user.save();
    }

    if (user.deviceId !== deviceId) {
        return res.json({
            access: false,
            message: "This account is already used on another device."
        });
    }

    // ✅ Success
    res.json({
        access: true,
        user: {
            email: user.email,
            plan: user.plan,
            deviceId: user.deviceId,
            expiry: user.expiry
        }
    });
});
// 🔹 Generate images (mock logic)
app.post("/generate-images", (req, res) => {
    let results = [];

    for (let i = 0; i < 20; i++) {
        results.push({
            image: "https://via.placeholder.com/150",
            cost: Math.floor(Math.random() * 200)
        });
    }

    results.sort((a, b) => a.cost - b.cost);

    res.json(results);
});

// 🔹 HISTORY: Add history
app.post("/add-history", async (req, res) => {
    const { email, route, cost } = req.body;
    const date = new Date().toLocaleDateString();

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    user.history.unshift({ date, route, cost });
    await user.save();

    res.json({ success: true, history: user.history });
});

// 🔹 HISTORY: Get history
app.get("/get-history/:email", async (req, res) => {
    const email = req.params.email;

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, history: user.history });
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});