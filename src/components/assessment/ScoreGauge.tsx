'use client';

import { useEffect, useState } from 'react';
import { MATURITY_BANDS, MATURITY_BAND_SHORT } from '@/lib/snapshot/result-copy';

/**
 * The readiness score, drawn as evidence rather than printed as a readout.
 *
 * A 220 degree arc, white on a white/16% track over MK navy. The value arc carries no accent
 * hue because this brand has none -- the approved website and the logo contain two navies,
 * slate and white, and inventing a third colour here is exactly the error this replaces.
 *
 * Deliberately absent: a caret marking an "uncapped calculated score". The engine caps
 * MATURITY, not the score, and persists no uncapped numeric value. Drawing one would be a
 * figure the database cannot reproduce. The cap is stated in words from the two persisted
 * maturity bands instead.
 */

const ARC_PATH = 'M 42.3 175.6 A 104 104 0 1 1 237.7 175.6';
const ARC_LENGTH = 399.4;
const SWEEP_MS = 900;

export function ScoreGauge({
  score,
  band,
  size = 'desktop'
}: {
  score: number | null;
  band: string | null;
  size?: 'desktop' | 'mobile';
}) {
  const target = score === null ? 0 : Math.max(0, Math.min(100, score));
  // Server-render the final value so there is no flash of an empty arc before hydration, and
  // so the score is correct without JavaScript. The client sweeps from 0 on mount instead.
  const [progress, setProgress] = useState(() => (typeof window === 'undefined' ? target : 0));

  useEffect(() => {
    if (score === null) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) {
      setProgress(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    // cubic-bezier(.16,1,.3,1) approximated by an ease-out quint; visually identical here.
    const ease = (t: number) => 1 - Math.pow(1 - t, 5);
    function step(now: number) {
      const t = Math.min(1, (now - start) / SWEEP_MS);
      setProgress(target * ease(t));
      if (t < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [score, target]);

  const offset = ARC_LENGTH * (1 - progress / 100);
  const strokeWidth = size === 'mobile' ? 13 : 12;
  const displayed = score === null ? null : Math.round(progress);

  const label = score === null
    ? 'Readiness score not issued. The assessment did not provide enough visibility to place a position.'
    : `Readiness score ${Math.round(score)} out of 100.${band ? ` Maturity band: ${band}.` : ''}`;

  return (
    <div className="text-center">
      <svg
        viewBox="0 0 280 196"
        role="img"
        aria-label={label}
        className={size === 'mobile' ? 'mx-auto block h-auto w-full max-w-[190px]' : 'mx-auto block h-auto w-full max-w-[262px]'}
      >
        <path
          d={ARC_PATH}
          fill="none"
          stroke="rgba(255,255,255,.16)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={score === null ? '6 10' : undefined}
        />
        {score === null ? null : (
          <path
            d={ARC_PATH}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={offset}
          />
        )}
        {score === null ? null : (
          <g stroke="rgba(255,255,255,.34)" strokeWidth="1.5" aria-hidden="true">
            <line x1="46.6" y1="74.6" x2="40.1" y2="70.0" />
            <line x1="140" y1="26" x2="140" y2="18" />
            <line x1="233.4" y1="74.6" x2="239.9" y2="70.0" />
          </g>
        )}
        {displayed === null ? (
          <text x="140" y="146" textAnchor="middle" fill="#FFFFFF" fontFamily="var(--font-poppins), sans-serif" fontWeight="600" fontSize="34">
            Not issued
          </text>
        ) : (
          <>
            <text
              x="140"
              y={size === 'mobile' ? 152 : 150}
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily="var(--font-poppins), sans-serif"
              fontWeight="600"
              fontSize={size === 'mobile' ? 76 : 72}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {displayed}
            </text>
            <text
              x={size === 'mobile' ? 208 : 205}
              y={size === 'mobile' ? 152 : 150}
              fill="rgba(255,255,255,.55)"
              fontFamily="var(--font-poppins), sans-serif"
              fontWeight="500"
              fontSize={size === 'mobile' ? 19 : 20}
            >
              /100
            </text>
          </>
        )}
      </svg>
      <ul
        className={`mx-auto flex justify-between gap-1 text-[8.5px] uppercase tracking-[0.05em] ${size === 'mobile' ? 'max-w-[186px]' : 'max-w-[246px]'}`}
        aria-hidden="true"
      >
        {MATURITY_BANDS.map((name) => (
          <li
            key={name}
            // white/52% is the accessibility floor for text on navy (5.5:1). White/45% fails AA.
            className={band === name ? 'font-semibold text-white' : 'text-white/[.52]'}
          >
            {size === 'mobile' ? MATURITY_BAND_SHORT[name] : name}
          </li>
        ))}
      </ul>
    </div>
  );
}
