const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    email: String,
    isActive: { type: Boolean, default: false },
    plan: { type: String, default: "free" },
    expiry: Date,
    deviceId: String,
    history: [{
        date: String,
        route: String,
        cost: Number
    }]
});

module.exports = mongoose.model("User", userSchema);