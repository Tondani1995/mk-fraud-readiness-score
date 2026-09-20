'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { trackEvent } from '@/lib/website/gtag';

type Params = Record<string, string | number | boolean | undefined>;

type Props = ComponentProps<typeof Link> &
  (
    | { ctaName: string; placement: string; eventName?: undefined; eventParams?: undefined }
    | { eventName: string; eventParams: Params; ctaName?: undefined; placement?: undefined }
  );

/**
 * A Next link that records a GA4 event (consent-gated inside trackEvent). By default it sends
 * `cta_click` with `cta_name` and `placement`; pass `eventName`/`eventParams` to keep an existing
 * event contract such as `social_click` or `contact_click`.
 */
export default function TrackedLink({ ctaName, placement, eventName, eventParams, onClick, ...props }: Props) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        if (eventName) trackEvent(eventName, eventParams);
        else trackEvent('cta_click', { cta_name: ctaName, placement });
        onClick?.(event);
      }}
    />
  );
}
