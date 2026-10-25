'use client';
import { useRef, useState } from 'react';
const routes = [
  '/',
  '/services',
  '/fraud-readiness',
  '/fraud-readiness/advisory',
  '/score/start',
  '/score/visual-review/adaptive/mid',
  '/score/visual-review/adaptive/early',
  '/score/visual-review/adaptive/late',
  '/score/visual-review/adaptive/review',
  '/design-review/interaction',
  '/score/visual-review/snapshot/score-60',
  ...['mixed-controls', 'critical-controls', 'strong-controls', 'partial-coverage', 'visibility-limited'].map(
    (variant) => `/score/visual-review/calculated/${variant}`
  ),
  '/score/visual-review/snapshot/insufficient-visibility',
  '/score/visual-review/order/essential/billing-invoice',
  '/score/visual-review/order/comprehensive/billing-invoice',
  '/score/visual-review/order/essential/payment',
  '/design-review/states',
  '/design-review/report',
  '/design-review/recovery',
  '/design-review/flow?stage=orientation',
  '/design-review/flow?stage=area',
  '/design-review/flow?stage=completion'
];
/** Local/preview rendered WCAG scan. No records, forms or external services are touched. */
export function AccessibilityReview() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [route, setRoute] = useState('/');
  const [width, setWidth] = useState('390');
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      // A frame may finish loading between a readiness check and a load listener.
      // Poll bounded DOM readiness so the audit cannot hang on a missed event.
      const deadline = performance.now() + 8000;
      while (frame.current?.contentDocument?.readyState !== 'complete' ||
        (new URL(frame.current?.contentDocument?.URL ?? 'about:blank').pathname + new URL(frame.current?.contentDocument?.URL ?? 'about:blank').search) !== route) {
        if (performance.now() > deadline) throw Error('Page under review did not finish loading');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const doc = frame.current?.contentDocument;
      if (!doc) throw Error('Frame not loaded');
      const script = doc.createElement('script');
      script.src = '/design-review/accessibility/engine';
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(Error('Accessibility engine did not load'));
        doc.head.appendChild(script);
      });
      const engine = (
        frame.current?.contentWindow as unknown as {
          axe: typeof import('axe-core');
        }
      ).axe;
      function contrastEvidence(target: unknown[]) {
        try {
          if (target.some((part) => typeof part !== 'string')) return null;
          const element = doc!.querySelector(target.join(' '));
          const ancestors = [];
          for (let node = element, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
            const style = doc!.defaultView!.getComputedStyle(node);
            const before = doc!.defaultView!.getComputedStyle(node, '::before');
            ancestors.push({
              tag: node.tagName,
              class: node.getAttribute('class'),
              color: style.color,
              fill: style.fill,
              background: style.backgroundColor,
              opacity: style.opacity,
              beforeContent: before.content,
              beforeBackground: before.backgroundImage
            });
          }
          return ancestors;
        } catch {
          return null;
        }
      }
      const report = await engine.run(doc, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
        }
      });
      setResult({
        route,
        width,
        layout: {
          viewportWidth: doc.defaultView?.innerWidth,
          scrollWidth: doc.documentElement.scrollWidth,
          overflow: [...doc.querySelectorAll('main *')]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              const style = doc.defaultView!.getComputedStyle(element);
              return (
                rect.width > 2 &&
                rect.height > 2 &&
                style.visibility !== 'hidden' &&
                !element.closest('[aria-hidden="true"],.sr-only') &&
                (rect.right > doc.defaultView!.innerWidth + 2 || rect.left < -2)
              );
            })
            .slice(0, 10)
            .map((element) => ({
              tag: element.tagName,
              text: element.textContent?.slice(0, 70)
            }))
        },
        typography: {
          headingFont: doc.querySelector('h1')
            ? doc.defaultView?.getComputedStyle(doc.querySelector('h1')!).fontFamily
            : null,
          smallVisibleText: [...doc.querySelectorAll('body *')]
            .filter((element) => {
              const style = doc.defaultView!.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return (
                rect.width > 2 &&
                rect.height > 2 &&
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                !element.closest('[aria-hidden="true"],.sr-only') &&
                [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim()) &&
                parseFloat(style.fontSize) < 12
              );
            })
            .map((element) => ({
              tag: element.tagName,
              text: element.textContent?.slice(0, 80),
              fontSize: doc.defaultView!.getComputedStyle(element).fontSize
            }))
        },
        violations: report.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary
          }))
        })),
        passes: report.passes.length,
        incomplete: report.incomplete.map((v) => ({
          id: v.id,
          description: v.description,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            contrastEvidence: contrastEvidence(n.target),
            html: n.html,
            summary: n.failureSummary,
            checks: [...n.any, ...n.all, ...n.none].map((check) => ({
              id: check.id,
              message: check.message,
              data: check.data
            }))
          }))
        }))
      });
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ padding: 24, background: '#f4f5f0' }}>
      <h1>Rendered accessibility review</h1>
      <p>Local/preview only. Scans visible content without submitting forms.</p>
      <label>
        Page{' '}
        <select
          aria-label="Page"
          value={route}
          onChange={(e) => {
            setRoute(e.target.value);
            setResult(null);
          }}
        >
          {routes.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        {' '}
        Width{' '}
        <select aria-label="Width" value={width} onChange={(e) => setWidth(e.target.value)}>
          {['320', '375', '390', '430', '768', '1440'].map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        style={{ margin: 16, padding: 12, border: '1px solid #001030' }}
      >
        {busy ? 'Scanning…' : 'Run accessibility scan'}
      </button>
      <pre id="audit-result" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
        {result ? JSON.stringify(result, null, 2) : 'Ready'}
      </pre>
      <iframe
        ref={frame}
        src={route}
        title="Page under review"
        style={{
          width: Number(width),
          boxSizing: 'content-box',
          height: 900,
          border: '1px solid #aaa',
          maxWidth: 'none'
        }}
      />
    </main>
  );
}
