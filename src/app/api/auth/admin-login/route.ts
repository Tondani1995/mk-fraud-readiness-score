import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { connectDB } from "@/lib/website/mongodb";
import { User } from "@/lib/website/models/User";

const COOKIE_NAME = "mk_admin_token";

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("Missing JWT_SECRET in .env");
    return new TextEncoder().encode(secret);
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null);
        const email = String(body?.email || "").toLowerCase().trim();
        const password = String(body?.password || "");

        if (!email || !password) {
            return NextResponse.json({ success: false, message: "Email and password are required." }, { status: 400 });
        }

        await connectDB();

        const user = await User.findOne({ email }).lean();
        if (!user) {
            return NextResponse.json({ success: false, message: "Invalid credentials." }, { status: 401 });
        }

        // ✅ Only admins allowed
        if (user.role !== "admin") {
            return NextResponse.json({ success: false, message: "Admins only." }, { status: 403 });
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
            return NextResponse.json({ success: false, message: "Invalid credentials." }, { status: 401 });
        }

        const token = await new SignJWT({
            sub: String(user._id),
            role: user.role,
            email: user.email,
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("7d")
            .sign(getJwtSecret());

        const res = NextResponse.json({ success: true }, { status: 200 });

        // httpOnly cookie (cannot be read by JS)
        res.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        return res;
    } catch (error: any) {
        return NextResponse.json(
            { success: false, message: error?.message || "Login failed" },
            { status: 500 }
        );
    }
}
