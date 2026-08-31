import mongoose, { Schema, models, model } from "mongoose";

const InsightSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true, trim: true },
        excerpt: { type: String, default: "", trim: true },
        content: { type: String, default: "", trim: true },
        tags: { type: [String], default: [] },
        author: { type: String, default: "MK Fraud Insights", trim: true },

        status: {
            type: String,
            enum: ["draft", "published"],
            default: "draft",
            index: true,
        },
        publishedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

const Insight = models.Insight || model("Insight", InsightSchema);
export default Insight;
