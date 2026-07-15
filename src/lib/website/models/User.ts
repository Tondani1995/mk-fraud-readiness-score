import mongoose, { Schema, models, model } from "mongoose";

export type UserRole = "admin" | "user";

const UserSchema = new Schema(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true },
        role: { type: String, enum: ["admin", "user"], default: "user" },
    },
    { timestamps: true }
);

export const User = models.User || model("User", UserSchema);
