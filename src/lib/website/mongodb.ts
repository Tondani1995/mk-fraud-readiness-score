import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

export function hasMongoConfiguration() {
    return Boolean(MONGODB_URI);
}

type MongooseCache = {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
};

declare global {
    var mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) global.mongooseCache = cache;

export async function connectDB() {
    if (cache.conn) return cache.conn;

    if (!MONGODB_URI) {
        throw new Error("Missing MONGODB_URI in environment variables");
    }

    if (!cache.promise) {
        cache.promise = mongoose
            .connect(MONGODB_URI, {
                bufferCommands: false,
            })
            .then((m) => m);
    }

    cache.conn = await cache.promise;
    return cache.conn;
}
