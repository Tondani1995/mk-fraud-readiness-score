import { NextResponse } from 'next/server';
import { CURRENT_BUILD_PHASE } from '@/lib/system/build-info';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'mk-fraud-readiness-score-v1',
    phase: CURRENT_BUILD_PHASE
  });
}
