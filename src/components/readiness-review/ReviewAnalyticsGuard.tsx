'use client';

import { useEffect } from 'react';
import { GA_MEASUREMENT_ID } from '@/lib/website/gtag';

/**
 * Review pages carry role credentials in their paths and never load analytics. A visitor can still arrive by an in-app
 * navigation from a website page where Google Analytics is already running in the same document; its history-based
 * page views read location.href directly, which no tag parameter can sanitise. Google's documented opt-out flag stops
 * every hit from this document from the moment a review page loads. Leaving the review track is a full page load, so
 * the website starts again with its normal consent rules.
 */
function disableAnalyticsForThisDocument() {
  if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
}

// Runs when the review bundle is evaluated, before any review page can change the address.
disableAnalyticsForThisDocument();

export function ReviewAnalyticsGuard() {
  useEffect(() => {
    disableAnalyticsForThisDocument();
  }, []);
  return null;
}
