import { NextResponse } from "next/server";
import { connectDB, hasMongoConfiguration } from "@/lib/website/mongodb";
import Insight from "@/lib/website/models/Insight";
import { adminUnauthorizedResponse, getAdminFromRequest } from "@/lib/website/adminAuth";
import { loadPublishedInsights } from "@/lib/website/insights/repository";

function slugify(input: string) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export async function GET(req: Request) {
    try {
        const isAdmin = Boolean(await getAdminFromRequest(req));
        if (!isAdmin) {
            const insights = await loadPublishedInsights();
            const publicInsights = insights.map(({ content: _content, ...insight }) => insight);
            return NextResponse.json({ success: true, data: publicInsights }, { status: 200 });
        }

        if (!hasMongoConfiguration()) {
            return NextResponse.json({ success: true, data: await loadPublishedInsights() }, { status: 200 });
        }

        await connectDB();
        const insights = await Insight.find({}).sort({ publishedAt: -1, createdAt: -1 }).lean();

        return NextResponse.json({ success: true, data: insights }, { status: 200 });
    } catch {
        return NextResponse.json(
            { success: false, message: "Failed to fetch insights" },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const admin = await getAdminFromRequest(req);
        if (!admin) return adminUnauthorizedResponse();

        if (!hasMongoConfiguration()) {
            return NextResponse.json(
                { success: false, message: "Content administration is unavailable until MONGODB_URI is configured." },
                { status: 503 }
            );
        }
        await connectDB();

        const body = await req.json();
        const title = (body?.title || "").toString().trim();
        const excerpt = (body?.excerpt || "").toString().trim();
        const content = (body?.content || "").toString().trim();
        const tags = Array.isArray(body?.tags) ? body.tags : [];
        const author = (body?.author || "MK Fraud Insights").toString().trim();
        const status = body?.status === "published" ? "published" : "draft";

        if (!title) {
            return NextResponse.json(
                { success: false, message: "Title is required" },
                { status: 400 }
            );
        }

        let slug = (body?.slug || "").toString().trim();
        if (!slug) slug = slugify(title);

        const exists = await Insight.findOne({ slug }).select("_id").lean();
        if (exists) {
            return NextResponse.json(
                { success: false, message: "Slug already exists" },
                { status: 409 }
            );
        }

        const created = await Insight.create({
            title,
            slug,
            excerpt,
            content,
            tags,
            author,
            status,
            publishedAt: status === "published" ? new Date() : null,
        });

        return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch {
        return NextResponse.json(
            { success: false, message: "Failed to create insight" },
            { status: 500 }
        );
    }
}
