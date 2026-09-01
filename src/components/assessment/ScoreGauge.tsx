'use client';

import { useEffect, useState } from 'react';
import { MATURITY_BANDS, MATURITY_BAND_SHORT } from '@/lib/snapshot/result-copy';

type ScoreGaugeProps = {
  score: number | null;
  band?: string | null;
  size?: 'desktop' | 'mobile';
  theme?: 'dark' | 'light';
};

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A centred full-circle score mark. The value and denominator share one centre line at every
 * score length, including 100 and the Not issued state.
 */
export function ScoreGauge({ score, band, size = 'desktop', theme = 'dark' }: ScoreGaugeProps) {
  const target = score === null ? 0 : Math.max(0, Math.min(100, score));
  const [progress, setProgress] = useState(() => target);
  const isDark = theme === 'dark';
  const displayed = score === null ? null : Math.round(progress);
  const label = score === null
    ? 'Readiness score not issued. The assessment did not provide enough visibility to place a position.'
    : `Readiness score ${Math.round(score)} out of 100${band ? `. Maturity band: ${band}.` : '.'}`;

  useEffect(() => {
    if (score === null) {
      setProgress(0);
      return;
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) {
      setProgress(target);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const easeOut = (value: number) => 1 - Math.pow(1 - value, 4);
    const step = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / 720);
      setProgress(target * easeOut(elapsed));
      if (elapsed < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [score, target]);

  const sizeClass = size === 'mobile' ? 'max-w-[220px]' : 'max-w-[270px]';
  const track = isDark ? 'rgba(255,255,255,.16)' : '#d8d0c2';
  const valueStroke = isDark ? '#ffffff' : '#001030';
  const valueText = isDark ? '#ffffff' : '#001030';
  const mutedText = isDark ? 'rgba(255,255,255,.62)' : '#667085';

  return (
    <div className="text-center" data-score-gauge data-score-gauge-value={score === null ? 'not-issued' : Math.round(score)}>
      <svg viewBox="0 0 240 240" role="img" aria-label={label} className={`mx-auto block h-auto w-full ${sizeClass}`}>
        <circle cx="120" cy="120" r={RADIUS} fill="none" stroke={track} strokeWidth="14" />
        {score === null ? (
          <circle cx="120" cy="120" r={RADIUS} fill="none" stroke={track} strokeWidth="14" strokeDasharray="5 9" />
        ) : (
          <circle
            cx="120"
            cy="120"
            r={RADIUS}
            fill="none"
            stroke={valueStroke}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress / 100)}
            transform="rotate(-90 120 120)"
          />
        )}
        {displayed === null ? (
          <text x="120" y="127" textAnchor="middle" fill={valueText} fontFamily="var(--font-poppins), sans-serif" fontWeight="600" fontSize="24">
            Not issued
          </text>
        ) : (
          <>
            <text x="120" y="116" textAnchor="middle" fill={valueText} fontFamily="var(--font-poppins), sans-serif" fontWeight="600" fontSize="58" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {displayed}
            </text>
            <text x="120" y="147" textAnchor="middle" fill={mutedText} fontFamily="var(--font-poppins), sans-serif" fontWeight="500" fontSize="16">
              /100
            </text>
          </>
        )}
      </svg>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: mutedText }}>
        {band ?? 'Result status'}
      </p>
    </div>
  );
}
