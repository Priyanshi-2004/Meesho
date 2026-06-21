const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 7001;

mongoose.connect(process.env.MONGO_URI);

const User = require("./models/User");

const router = express.Router();

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
router.get("/admin/users", async (req, res) => {
    try {
        const users = await User.find().sort({ _id: -1 });
        const mappedUsers = users.map(user => ({
            ...user.toObject(),
            userType: user.plan,
            termsAccepted: user.acceptedTerms
        }));
        res.json({ success: true, status: "success", users: mappedUsers });
    } catch (err) {
        res.status(500).json({ success: false, status: "error", message: "Error fetching users" });
    }
});

// 🔹 ADMIN: Add or Edit user (matching admin panel index.html)
router.post("/admin/users", async (req, res) => {
    try {
        const { name, email, userType, plan, credits } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, status: "error", message: "Email is required" });
        }
        const cleanEmail = email.trim().toLowerCase();
        const finalPlan = plan || userType || "free";
        const finalCredits = finalPlan === "paid" ? 999999 : (credits !== undefined ? parseInt(credits) : 10);

        let user = await User.findOne({ email: cleanEmail });
        if (user) {
            user.name = name || user.name;
            user.plan = finalPlan;
            user.credits = finalCredits;
            await user.save();
        } else {
            user = new User({
                name: name || "User",
                email: cleanEmail,
                plan: finalPlan,
                credits: finalCredits,
                isActive: true,
                expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
            await user.save();
        }

        res.json({
            success: true,
            status: "success",
            user: {
                ...user.toObject(),
                userType: user.plan,
                termsAccepted: user.acceptedTerms
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, status: "error", message: err.message });
    }
});

// 🔹 ADMIN: Add user (original endpoint, updated to support plan and default credits)
router.post("/admin/add-user", async (req, res) => {
    try {
        const email = (req.body.email || "").trim().toLowerCase();
        const plan = req.body.plan || "free";
        const credits = req.body.credits !== undefined ? parseInt(req.body.credits) : (plan === "paid" ? 999999 : 10);
        const expiry = req.body.expiry ? new Date(req.body.expiry) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        if (!email) {
            return res.status(400).json({ success: false, status: "error", message: "Email is required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, status: "error", message: "User already exists" });
        }

        const user = new User({
            name: "User",
            email,
            isActive: true,
            plan,
            credits,
            expiry
        });

        await user.save();
        res.json({ success: true, status: "success", user });
    } catch (err) {
        res.status(500).json({ success: false, status: "error", message: err.message });
    }
});

// 🔹 ADMIN: Delete user (matching admin panel index.html)
router.delete("/admin/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await User.findByIdAndDelete(id);
        res.json({ success: true, status: "success" });
    } catch (err) {
        res.status(500).json({ success: false, status: "error", message: "Error deleting user" });
    }
});

// 🔹 ADMIN: Update credits manually
router.post("/admin/update-credits", async (req, res) => {
    try {
        const { email, credits } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, status: "error", message: "Email is required" });
        }
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) {
            return res.status(404).json({ success: false, status: "error", message: "User not found" });
        }

        user.credits = parseInt(credits);
        await user.save();

        res.json({ success: true, status: "success", credits: user.credits });
    } catch (err) {
        res.status(500).json({ success: false, status: "error", message: err.message });
    }
});

// 🔹 ADMIN: Toggle user status
router.post("/admin/toggle-status", async (req, res) => {
    try {
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

        res.json({ success: true, status: "success" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 🔹 EXTENSION: Accept Terms & Conditions
router.post("/accept-terms", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, status: "error", message: "Email is required" });
        }
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) {
            return res.status(404).json({ success: false, status: "error", message: "User not found" });
        }

        user.acceptedTerms = true;
        user.acceptedTermsDate = new Date();
        await user.save();

        res.json({
            success: true,
            status: "success",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                plan: user.plan,
                userType: user.plan,
                credits: user.credits,
                acceptedTerms: user.acceptedTerms,
                termsAccepted: user.acceptedTerms,
                isActive: user.isActive,
                deviceId: user.deviceId,
                expiry: user.expiry
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, status: "error", message: err.message });
    }
});

// 🔹 EXTENSION: Use Credit
router.post("/use-credit", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, status: "error", message: "Email is required" });
        }
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) {
            return res.status(404).json({ success: false, status: "error", message: "User not found" });
        }

        if (user.plan === "free") {
            if (user.credits <= 0) {
                return res.status(400).json({ success: false, status: "error", message: "Out of credits. Please purchase premium." });
            }
            user.credits -= 1;
            await user.save();
        }

        res.json({
            success: true,
            status: "success",
            credits: user.credits
        });
    } catch (err) {
        res.status(500).json({ success: false, status: "error", message: err.message });
    }
});

// 🔹 EXTENSION: Check email plan/existence
router.get("/check-email/:email", async (req, res) => {
    try {
        const email = req.params.email.trim().toLowerCase();
        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ exists: false, plan: "free" }); // new users are free
        }
        res.json({ exists: true, plan: user.plan });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 EXTENSION: Login/Sync
router.post("/extension-login", async (req, res) => {
    try {
        const { name, email, referralCode } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, status: "error", message: "Email is required" });
        }
        const cleanEmail = email.trim().toLowerCase();

        let user = await User.findOne({ email: cleanEmail });
        if (!user) {
            user = new User({
                name: name || "User",
                email: cleanEmail,
                plan: "free",
                credits: 10,
                isActive: true,
                expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
            await user.save();
        }

        res.json({
            success: true,
            status: "success",
            user: {
                id: user._id,
                name: user.name || name || "User",
                email: user.email,
                plan: user.plan,
                userType: user.plan,
                credits: user.credits,
                acceptedTerms: user.acceptedTerms,
                termsAccepted: user.acceptedTerms,
                isActive: user.isActive,
                deviceId: user.deviceId,
                expiry: user.expiry
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, status: "error", message: err.message });
    }
});

// 🔹 CHECK USER ACCESS (Updated for credits & plan data)
router.post("/check-user", async (req, res) => {
    try {
        const { email, deviceId } = req.body;
        if (!email) {
            return res.json({ access: false, message: "Email is required" });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });

        if (!user) {
            return res.json({
                access: false,
                message: "This email is not registered. Please purchase access."
            });
        }

        if (!user.isActive) {
            return res.json({
                access: false,
                message: "Your access is inactive. Contact support."
            });
        }

        if (!user.deviceId) {
            user.deviceId = deviceId;
            await user.save();
        }

        if (deviceId && user.deviceId !== deviceId) {
            return res.json({
                access: false,
                message: "This account is already used on another device."
            });
        }

        res.json({
            access: true,
            plan: user.plan,
            userType: user.plan,
            credits: user.credits,
            acceptedTerms: user.acceptedTerms,
            termsAccepted: user.acceptedTerms,
            isActive: user.isActive,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                plan: user.plan,
                userType: user.plan,
                credits: user.credits,
                acceptedTerms: user.acceptedTerms,
                termsAccepted: user.acceptedTerms,
                deviceId: user.deviceId,
                expiry: user.expiry,
                isActive: user.isActive,
                activationDate: user._id.getTimestamp()
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 🔹 Generate images (mock logic)
router.post("/generate-images", (req, res) => {
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
router.post("/add-history", async (req, res) => {
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
router.get("/get-history/:email", async (req, res) => {
    const email = req.params.email;

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, history: user.history });
});

app.use("/auth", router);
app.use("/", router);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});