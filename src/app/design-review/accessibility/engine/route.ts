import { readFile } from "node:fs/promises";
import path from "node:path";
export const dynamic = "force-dynamic";
export async function GET() {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  const source = await readFile(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
  );
  return new Response(source, {
    headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" },
  });
}
