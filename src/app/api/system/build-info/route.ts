import { NextResponse } from 'next/server';
import { CURRENT_BUILD_PHASE, CURRENT_RELEASE_CHANNEL } from '@/lib/system/build-info';

export function GET() {
  return NextResponse.json({
    app: 'MK Fraud Readiness Score V1',
    phase: CURRENT_BUILD_PHASE,
    releaseChannel: CURRENT_RELEASE_CHANNEL
  });
}
