import { NextResponse } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";

const COOKIE_NAME = "mk_admin_token";

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("Missing JWT_SECRET in environment variables");
    return new TextEncoder().encode(secret);
}

function getCookieFromRequest(req: Request, name: string) {
    const cookieHeader = req.headers.get("cookie");
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
    const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    if (!match) return null;

    return decodeURIComponent(match.slice(name.length + 1));
}

export async function getAdminFromRequest(req: Request): Promise<JWTPayload | null> {
    const token = getCookieFromRequest(req, COOKIE_NAME);
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, getJwtSecret());
        if (payload.role !== "admin") return null;
        return payload;
    } catch {
        return null;
    }
}

export async function isAdminRequest(req: Request) {
    return Boolean(await getAdminFromRequest(req));
}

export function adminUnauthorizedResponse(message = "Admin authentication required.") {
    return NextResponse.json({ success: false, message }, { status: 401 });
}
