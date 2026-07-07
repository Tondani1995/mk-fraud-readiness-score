import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'mk-fraud-readiness-score-v1',
    phase: 'phase-6-consolidated-scoring'
  });
}
