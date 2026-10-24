'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BaselineAdaptiveAssessmentExperience } from '@/components/review/BaselineAdaptiveAssessmentExperience';
import { AdaptiveAssessmentExperience } from '@/components/adaptive/AdaptiveAssessmentExperience';

type Sample = {
  selectionFeedbackMs?: number;
  nextUsableMs?: number;
  networkMs?: number;
  responseBytes?: number;
  fixtureComputeMs?: number;
  simulatedTransportMs?: number;
  frameIntervalsMs: number[];
  motionFrames?: { atMs: number; visibleOptions: number; enabledRadios: number; stageOpacity: number }[];
};
/** Browser-native performance probe around the real component and a synthetic HTTP transport. */
export function AssessmentBenchmark() {
  const [implementation, setImplementation] = useState('current');
  const [styleReady, setStyleReady] = useState(true);
  const [profile, setProfile] = useState('desktop');
  const profileRef = useRef(profile);
  const [state, setState] = useState<any>(null);
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('success');
  const failureRef = useRef(failure);
  const session = useRef('');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [starts, setStarts] = useState<{ variant: string; durationMs: number }[]>([]);
  const [attempted, setAttempted] = useState(0);
  const [committed, setCommitted] = useState(0);
  const motionCapture = useRef(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [metrics, setMetrics] = useState<any>({});
  const stage = useRef<HTMLDivElement>(null);
  const longTasks = useRef<number[]>([]);
  const active = useRef<{ began: number; heading: string; sample: Sample; lastFrame: number } | null>(null);
  const request = useCallback<typeof fetch>(async (_url, init) => {
    if (init?.method === 'POST') setAttempted((value) => value + 1);
    const began = performance.now();
    const failed = failureRef.current;
    failureRef.current = 'success';
    setFailure('success');
    const response = await fetch('/design-review/benchmark/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: init?.method === 'POST' ? 'save' : 'read',
        session: session.current,
        profile: profileRef.current,
        failure: failed,
        compact: new Headers(init?.headers).get('x-mk-adaptive-state') === 'compact-v1',
        fingerprint: new Headers(init?.headers).get('x-mk-graph-fingerprint'),
        write: init?.body ? JSON.parse(String(init.body)) : undefined
      })
    });
    if (response.ok && init?.method === 'POST')
      setCommitted(Number(response.headers.get('X-MK-Synthetic-Writes')));
    const sample = active.current?.sample;
    if (sample) {
      sample.networkMs = performance.now() - began;
      sample.responseBytes = Number(response.headers.get('X-MK-Synthetic-Bytes'));
      const timing = response.headers.get('Server-Timing') ?? '';
      sample.fixtureComputeMs = Number(timing.match(/fixture;dur=([\d.]+)/)?.[1]);
      sample.simulatedTransportMs = Number(timing.match(/simulatedTransport;dur=([\d.]+)/)?.[1]);
    }
    return response;
  }, []);
  useEffect(() => {
    const observer =
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes.includes('longtask')
        ? new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) longTasks.current.push(entry.duration);
          })
        : null;
    observer?.observe({ type: 'longtask' });
    let frame = 0;
    const tick = (now: number) => {
      const pending = active.current;
      const root = stage.current;
      if (pending && root) {
        if (motionCapture.current) {
          const slots = [...root.querySelectorAll<HTMLElement>('.answer-slot')];
          const visible = slots.filter(
            (slot) => slot.getBoundingClientRect().height > 1 && getComputedStyle(slot).opacity !== '0'
          );
          const phase = root.querySelector<HTMLElement>('[data-question-stage]');
          (pending.sample.motionFrames ??= []).push({
            atMs: now - pending.began,
            visibleOptions: visible.length,
            enabledRadios: root.querySelectorAll('input[type="radio"]:not(:disabled)').length,
            stageOpacity: phase ? Number(getComputedStyle(phase).opacity) : 1
          });
        }
        if (pending.lastFrame) pending.sample.frameIntervalsMs.push(now - pending.lastFrame);
        pending.lastFrame = now;
        if (!pending.sample.selectionFeedbackMs && root.querySelector('input[type="radio"]:checked'))
          pending.sample.selectionFeedbackMs = now - pending.began;
        const heading = root.querySelector('h1')?.textContent ?? '';
        const title = root.querySelector('h1');
        const available = root.querySelector('input[type="radio"]:not(:disabled)');
        const titleRect = title?.getBoundingClientRect();
        if (
          heading !== pending.heading &&
          available &&
          titleRect &&
          titleRect.top >= -2 &&
          titleRect.bottom < window.innerHeight
        ) {
          pending.sample.nextUsableMs = now - pending.began;
          setSamples((current) => [...current, pending.sample]);
          active.current = null;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);
  function beginInput(event: React.PointerEvent | React.KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (
      !target.closest('label')?.querySelector('input[type="radio"]') &&
      !(target instanceof HTMLInputElement && target.type === 'radio')
    )
      return;
    if ('key' in event && ![' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key))
      return;
    if (active.current) return;
    active.current = {
      began: performance.now(),
      heading: stage.current?.querySelector('h1')?.textContent ?? '',
      sample: { frameIntervalsMs: [] },
      lastFrame: 0
    };
  }
  async function reset(variant = 'mid') {
    setBusy(true);
    active.current = null;
    setAttempted(0);
    setCommitted(0);
    const began = performance.now();
    const response = await fetch('/design-review/benchmark/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'reset', profile: profileRef.current, variant })
    });
    const body = await response.json();
    session.current = body.session;
    setState(body.state);
    setGeneration((value) => value + 1);
    setBusy(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setStarts((current) => [...current, { variant, durationMs: performance.now() - began }]);
      })
    );
  }
  function summary(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      n: sorted.length,
      p50: sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)],
      p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
      worst: sorted.at(-1)
    };
  }
  function exportMetrics() {
    setMetrics({
      implementation,
      attemptedSaves: attempted,
      committedWrites: committed,
      reducedMotionPreview: reduced,
      profile: profileRef.current,
      scope:
        'Real browser UI + gzip HTTP/state fixture with configured latency/bandwidth. No database timings; desktop CPU, no mobile hardware emulation.',
      initialStateReadyMs: summary(
        starts.filter((item) => item.variant === 'early').map((item) => item.durationMs)
      ),
      midStateReadyMs: summary(
        starts.filter((item) => item.variant === 'mid').map((item) => item.durationMs)
      ),
      selectionFeedbackMs: summary(
        samples.flatMap((s) => (s.selectionFeedbackMs === undefined ? [] : [s.selectionFeedbackMs]))
      ),
      nextUsableMs: summary(samples.flatMap((s) => (s.nextUsableMs === undefined ? [] : [s.nextUsableMs]))),
      networkMs: summary(samples.flatMap((s) => (s.networkMs === undefined ? [] : [s.networkMs]))),
      samples,
      starts,
      longTasksMs: longTasks.current,
      resources: performance
        .getEntriesByType('navigation')
        .map((e) => ({ type: e.entryType, duration: e.duration })),
      resolvedStyles: {
        headingFont: stage.current?.querySelector('h1')
          ? getComputedStyle(stage.current.querySelector('h1')!).fontFamily
          : null,
        headingSize: stage.current?.querySelector('h1')
          ? getComputedStyle(stage.current.querySelector('h1')!).fontSize
          : null,
        panelRadius: stage.current?.querySelector('.question-instrument,.clarity-card')
          ? getComputedStyle(stage.current.querySelector('.question-instrument,.clarity-card')!).borderRadius
          : null
      },
      userAgent: navigator.userAgent
    });
  }
  return (
    <div
      className="mk-product benchmark-page"
      data-review-reduced-motion={reduced ? 'true' : undefined}
      data-baseline={implementation === 'baseline' ? 'true' : undefined}
    >
      {implementation === 'baseline' && (
        <link
          rel="stylesheet"
          href="/design-review/benchmark/baseline-style"
          onLoad={() => setStyleReady(true)}
        />
      )}
      <details className="benchmark-controls" open>
        <summary>Performance laboratory · synthetic HTTP state only</summary>
        <p>
          Same real assessment component. Defined latency + bandwidth envelope; desktop host CPU. No customer
          data, database, submission or provider calls. Begin measures fixture initial-state readiness, not
          real database creation.
        </p>
        <label>
          Implementation{' '}
          <select
            value={implementation}
            onChange={(e) => {
              setImplementation(e.target.value);
              setStyleReady(e.target.value !== 'baseline');
              setState(null);
              setSamples([]);
              setStarts([]);
              active.current = null;
            }}
          >
            <option value="current">Current guided instrument</option>
            <option value="baseline">Baseline 83ae9db4</option>
          </select>
        </label>
        <label>
          Network profile{' '}
          <select
            value={profile}
            onChange={(e) => {
              profileRef.current = e.target.value;
              setProfile(e.target.value);
            }}
          >
            <option value="desktop">Desktop · 30ms / 10Mbps</option>
            <option value="mobile">Mobile network proxy · 150ms / 1.6Mbps</option>
            <option value="slow">Slow · 600ms / 0.75Mbps</option>
          </select>
        </label>
        <label>
          Next save{' '}
          <select
            value={failure}
            onChange={(e) => {
              failureRef.current = e.target.value;
              setFailure(e.target.value);
            }}
          >
            <option value="success">Success</option>
            <option value="offline">Failure once</option>
            <option value="conflict">Conflict once</option>
          </select>
        </label>
        <button disabled={busy || !styleReady} onClick={() => void reset('mid')}>
          Begin benchmark
        </button>
        <button disabled={busy || !styleReady} onClick={() => void reset('early')}>
          Begin gateways
        </button>
        <button
          onClick={() => {
            setSamples([]);
            setStarts([]);
            longTasks.current = [];
            active.current = null;
          }}
        >
          Clear measurements
        </button>
        <button onClick={exportMetrics}>Export measurements</button>
        <button
          aria-pressed={motionEnabled}
          onClick={() => {
            motionCapture.current = !motionCapture.current;
            setMotionEnabled(motionCapture.current);
          }}
        >
          Capture motion metrics
        </button>
        <button onClick={() => setReduced((value) => !value)} aria-pressed={reduced}>
          Reduced motion preview
        </button>
        <button
          onClick={() => {
            const choices = stage.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
            choices?.[0]?.click();
            choices?.[1]?.click();
          }}
        >
          Rapid selection probe
        </button>
        <p data-save-counts>
          {attempted} save requests · {committed} committed writes
        </p>
        <p data-benchmark-count>{samples.length} completed transitions</p>
        <pre id="benchmark-result">{JSON.stringify(metrics, null, 2)}</pre>
      </details>
      <div ref={stage} onPointerDownCapture={beginInput} onKeyDownCapture={beginInput}>
        {state ? (
          implementation === 'baseline' ? (
            <BaselineAdaptiveAssessmentExperience
              key={`baseline-${generation}`}
              assessmentReference="BENCHMARK-ONLY"
              token="synthetic-only"
              initialState={state}
              visualReview
              reviewTransport={request}
            />
          ) : (
            <AdaptiveAssessmentExperience
              key={generation}
              assessmentReference="BENCHMARK-ONLY"
              token="synthetic-only"
              initialState={state}
              visualReview
              reviewTransport={request}
            />
          )
        ) : (
          <p>Choose a profile, then Begin benchmark.</p>
        )}
      </div>
    </div>
  );
}
