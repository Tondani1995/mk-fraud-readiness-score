import { NextResponse } from 'next/server';
import { listCatalogue } from '@/lib/commercial/product-catalogue';

// Public, read-only paid-product catalogue. It exposes presentation metadata only: no order is
// created here and Advisory is returned with selfServiceOrderable: false so no caller can route it
// into order creation.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { ok: true, products: listCatalogue() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
