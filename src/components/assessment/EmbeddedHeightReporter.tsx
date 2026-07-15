'use client';

import { useEffect } from 'react';

const MESSAGE_TYPE = 'mk-fraud-assessment-height';

export function EmbeddedHeightReporter() {
  useEffect(() => {
    if (window.self === window.top) return;

    let frame = 0;

    const reportHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          document.documentElement.offsetHeight,
          document.body.offsetHeight
        );

        window.parent.postMessage({ type: MESSAGE_TYPE, height }, window.location.origin);
      });
    };

    reportHeight();

    const observer = new ResizeObserver(reportHeight);
    observer.observe(document.documentElement);
    observer.observe(document.body);

    window.addEventListener('load', reportHeight);
    window.addEventListener('resize', reportHeight);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('load', reportHeight);
      window.removeEventListener('resize', reportHeight);
    };
  }, []);

  return null;
}
