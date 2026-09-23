'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ACQUISITION_CONSENT_EVENTS, captureAcquisitionContext } from '@/lib/website/acquisition-context';

export default function AcquisitionAttribution() {
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    const capture = () => captureAcquisitionContext(search ? `?${search}` : '');
    capture();
    for (const eventName of ACQUISITION_CONSENT_EVENTS) window.addEventListener(eventName, capture);
    window.addEventListener('storage', capture);
    return () => {
      for (const eventName of ACQUISITION_CONSENT_EVENTS) window.removeEventListener(eventName, capture);
      window.removeEventListener('storage', capture);
    };
  }, [search]);

  return null;
}
