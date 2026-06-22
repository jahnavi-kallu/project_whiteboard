const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
    name: {type:String, required:true},
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

// Encrypt password before saving
userSchema.pre("save", async function () {
    // If the password wasn't changed, skip hashing automatically
    if (!this.isModified("password")) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        // Look, Ma! No next() needed! Mongoose resolves when the async function finishes.
    } catch (error) {
        throw new Error(error);
    }
});

// Compare hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);