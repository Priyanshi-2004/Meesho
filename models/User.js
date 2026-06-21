const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    isActive: { type: Boolean, default: false },
    plan: { type: String, default: "free" }, // 'free' or 'paid'
    credits: { type: Number, default: 10 },
    acceptedTerms: { type: Boolean, default: false },
    acceptedTermsDate: Date,
    expiry: Date,
    deviceId: String,
    history: [{
        date: String,
        route: String,
        cost: Number
    }]
});

module.exports = mongoose.model("User", userSchema);