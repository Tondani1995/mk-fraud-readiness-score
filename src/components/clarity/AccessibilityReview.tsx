"use client";
import { useRef, useState } from "react";
const routes = [
  "/",
  "/services",
  "/fraud-readiness",
  "/fraud-readiness/advisory",
  "/score/start",
  "/score/visual-review/adaptive/mid",
  "/score/visual-review/snapshot/score-60",
  "/score/visual-review/snapshot/insufficient-visibility",
  "/score/visual-review/order/essential/billing-invoice",
  "/design-review/states",
  "/design-review/report",
];
/** Development-only rendered WCAG scan. No records, forms or external services are touched. */
export function AccessibilityReview() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [route, setRoute] = useState("/");
  const [width, setWidth] = useState("390");
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      if (
        frame.current &&
        (frame.current.contentDocument?.readyState !== "complete" ||
          !frame.current.contentDocument?.URL.endsWith(route))
      ) {
        await new Promise<void>((resolve) =>
          frame.current?.addEventListener("load", () => resolve(), {
            once: true,
          }),
        );
      }
      const doc = frame.current?.contentDocument;
      if (!doc) throw Error("Frame not loaded");
      const script = doc.createElement("script");
      script.src = "/design-review/accessibility/engine";
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () =>
          reject(Error("Accessibility engine did not load"));
        doc.head.appendChild(script);
      });
      const engine = (
        frame.current?.contentWindow as unknown as {
          axe: typeof import("axe-core");
        }
      ).axe;
      const report = await engine.run(doc, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      });
      setResult({
        route,
        width,
        violations: report.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
        passes: report.passes.length,
        incomplete: report.incomplete.map((v) => v.id),
      });
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ padding: 24, background: "#f4f5f0" }}>
      <h1>Rendered accessibility review</h1>
      <p>
        Local development only. Scans visible content without submitting forms.
      </p>
      <label>
        Page{" "}
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
        {" "}
        Width{" "}
        <select
          aria-label="Width"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
        >
          {["320", "375", "390", "430", "768", "1440"].map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        style={{ margin: 16, padding: 12, border: "1px solid #001030" }}
      >
        {busy ? "Scanning…" : "Run accessibility scan"}
      </button>
      <pre id="audit-result" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
        {result ? JSON.stringify(result, null, 2) : "Ready"}
      </pre>
      <iframe
        ref={frame}
        src={route}
        title="Page under review"
        style={{
          width: Number(width),
          height: 900,
          border: "1px solid #aaa",
          maxWidth: "none",
        }}
      />
    </main>
  );
}
