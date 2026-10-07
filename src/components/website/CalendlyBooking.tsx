'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/website/gtag';
import {
  ACQUISITION_CONSENT_EVENTS,
  getCampaignAttribution,
  type CampaignAttribution,
} from '@/lib/website/acquisition-context';

const CALENDLY_ORIGIN = 'https://calendly.com';
const CALENDLY_URL = `${CALENDLY_ORIGIN}/mkfraud/30min`;
const BOOKING_DEDUPE_PREFIX = 'mk_calendly_booking:';

type CalendlyMessage = {
  event?: string;
  payload?: {
    event?: { uri?: string };
    invitee?: { uri?: string };
  };
};

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget(options: {
        url: string;
        parentElement: HTMLElement;
        utm?: {
          utmSource?: string;
          utmMedium?: string;
          utmCampaign?: string;
          utmTerm?: string;
          utmContent?: string;
        };
      }): void;
    };
  }
}

function calendlyUtm(attribution: CampaignAttribution) {
  return {
    utmSource: attribution.utm_source,
    utmMedium: attribution.utm_medium,
    utmCampaign: attribution.utm_campaign,
    utmTerm: attribution.utm_term,
    utmContent: attribution.utm_content,
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default function CalendlyBooking() {
  const containerRef = useRef<HTMLDivElement>(null);
  const claimedBookingsRef = useRef(new Set<string>());
  const calendarOpenedRef = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [attributionRevision, setAttributionRevision] = useState(0);

  const initialise = useCallback(() => {
    const container = containerRef.current;
    if (!container || !window.Calendly) return;
    container.replaceChildren();
    const attribution = getCampaignAttribution();
    window.Calendly.initInlineWidget({
      url: CALENDLY_URL,
      parentElement: container,
      utm: calendlyUtm(attribution),
    });
  }, []);

  useEffect(() => {
    const refresh = () => setAttributionRevision((value) => value + 1);
    for (const eventName of ACQUISITION_CONSENT_EVENTS) window.addEventListener(eventName, refresh);
    return () => {
      for (const eventName of ACQUISITION_CONSENT_EVENTS) window.removeEventListener(eventName, refresh);
    };
  }, []);

  useEffect(() => {
    if (scriptReady) initialise();
  }, [attributionRevision, initialise, scriptReady]);

  useEffect(() => {
    const handleCalendlyMessage = async (message: MessageEvent<CalendlyMessage>) => {
      if (message.origin !== CALENDLY_ORIGIN || !message.data?.event?.startsWith('calendly.')) return;

      if (
        !calendarOpenedRef.current &&
        (message.data.event === 'calendly.profile_page_viewed' || message.data.event === 'calendly.event_type_viewed')
      ) {
        calendarOpenedRef.current = true;
        trackEvent('service_calendar_opened', { page_path: '/contact', booking_provider: 'calendly' });
      }

      if (message.data.event !== 'calendly.event_scheduled') return;
      const eventUri = message.data.payload?.event?.uri;
      const inviteeUri = message.data.payload?.invitee?.uri;
      if (!eventUri && !inviteeUri) return;

      const bookingFingerprint = await sha256(`${eventUri ?? ''}|${inviteeUri ?? ''}`);
      if (claimedBookingsRef.current.has(bookingFingerprint)) return;
      claimedBookingsRef.current.add(bookingFingerprint);

      const sessionKey = `${BOOKING_DEDUPE_PREFIX}${bookingFingerprint}`;
      try {
        if (window.sessionStorage.getItem(sessionKey)) return;
        window.sessionStorage.setItem(sessionKey, 'pending');
      } catch {
        // The in-memory set still prevents duplicates if sessionStorage is unavailable.
      }

      try {
        const response = await fetch('/score/api/commercial-events/calendly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventUri,
            inviteeUri,
            attribution: getCampaignAttribution(),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error('booking_ledger_write_failed');

        try { window.sessionStorage.setItem(sessionKey, 'recorded'); } catch {}
        trackEvent('service_consultation_booked', {
          page_path: '/contact',
          booking_provider: 'calendly',
        });
      } catch {
        // Fail closed: GA4 must not become the only record of a commercial booking.
        try { window.sessionStorage.removeItem(sessionKey); } catch {}
        claimedBookingsRef.current.delete(bookingFingerprint);
      }
    };

    window.addEventListener('message', handleCalendlyMessage);
    return () => window.removeEventListener('message', handleCalendlyMessage);
  }, []);

  return (
    <>
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="h-full w-full" data-calendly-inline-widget />
    </>
  );
}
