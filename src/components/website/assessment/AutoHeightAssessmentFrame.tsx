'use client';

import { useEffect, useRef, useState } from 'react';

const MESSAGE_TYPE = 'mk-fraud-assessment-height';
const MIN_HEIGHT = 620;

export default function AutoHeightAssessmentFrame() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      const data = event.data as { type?: string; height?: unknown } | null;
      if (!data || data.type !== MESSAGE_TYPE || typeof data.height !== 'number') return;

      const nextHeight = Math.max(MIN_HEIGHT, Math.ceil(data.height));
      setHeight((current) => (Math.abs(current - nextHeight) > 2 ? nextHeight : current));
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      title="MK Fraud Readiness Score"
      src="/score/start?embed=1"
      className="w-full border-0 transition-[height] duration-200 ease-out"
      style={{ height }}
      loading="eager"
    />
  );
}
