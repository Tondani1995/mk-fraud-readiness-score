import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    app: 'MK Fraud Readiness Score V1',
    phase: process.env.MK_BUILD_PHASE ?? 'phase-6-consolidated-scoring',
    releaseChannel: process.env.MK_RELEASE_CHANNEL ?? 'local'
  });
}
