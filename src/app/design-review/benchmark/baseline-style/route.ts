import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview')
  )
    return new Response(null, { status: 404 });
  return new Response(
    (await readFile(path.join(process.cwd(), 'src/lib/visual-review/baseline-clarity.css.txt'), 'utf8')) +
      '\n.mk-product[data-baseline="true"] .clarity-card{border-radius:4px!important}.mk-product[data-baseline="true"] :is(button,a)[class*="rounded"]{border-radius:3px!important}',
    { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' } }
  );
}
