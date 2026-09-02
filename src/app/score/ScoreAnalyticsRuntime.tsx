'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import CookieConsent from '@/components/website/CookieConsent';
import GoogleAnalytics from '@/components/website/GoogleAnalytics';

const PRIVATE_SCORE_PATH_PREFIXES = ['/score/admin', '/score/visual-review'];

function isPrivateScorePath(pathname: string | null) {
  return Boolean(pathname && PRIVATE_SCORE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

export default function ScoreAnalyticsRuntime() {
  const pathname = usePathname();

  if (isPrivateScorePath(pathname)) return null;

  return (
    <>
      <Suspense fallback={null}>
        <GoogleAnalytics />
      </Suspense>
      <CookieConsent />
    </>
  );
}
