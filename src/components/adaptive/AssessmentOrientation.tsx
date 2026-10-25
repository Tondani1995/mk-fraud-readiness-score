"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
type Scale = {
  responseValue: number;
  label: string;
  operationalMeaning?: string | null;
};
/** Guidance only. The worked example never enters the assessment response/persistence path. */
export function AssessmentOrientation({
  scale,
  onBegin,
}: {
  scale: Scale[];
  onBegin: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const [example, setExample] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <section className="mx-auto max-w-3xl rounded-panel border border-mk-line bg-white p-6 md:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">
        Fraud Readiness Assessment
      </p>
      <h1
        ref={heading}
        tabIndex={-1}
        className="mt-4 text-3xl font-medium leading-snug text-mk-navy"
      >
        Before you begin
      </h1>
      <div className="mt-6 space-y-5 text-base leading-relaxed text-mk-muted">
        <p>
          Answer for how your organisation operates today. Read the meaning
          beneath each response and choose the closest match. Select “I do not
          know” when you cannot confirm the position.
        </p>
        <p>
          Your answers are saved as you go, and the next question appears after
          a successful save. You can use Back to review or change an answer, and
          you will review your responses before submitting.
        </p>
        <p>
          Your private resume link lets you return to the saved assessment
          later. Keep it confidential within your organisation.
        </p>
      </div>
      <details className="mt-6 border-y border-mk-line py-5">
        <summary className="cursor-pointer font-medium text-mk-navy">
          Understand the response scale with an example
        </summary>
        <p className="mt-4 text-base leading-relaxed text-mk-muted">
          In this example, a capability operates in key areas, but its coverage
          is not yet organisation-wide. Choose the closest response below.
        </p>
        <fieldset className="mt-5 space-y-3">
          <legend className="sr-only">Practice response, not saved</legend>
          {scale.map((option) => (
            <label
              key={option.responseValue}
              className="flex gap-3 rounded-brand border border-mk-line p-4"
            >
              <input
                type="radio"
                name="orientation-example"
                checked={example === option.responseValue}
                onChange={() => setExample(option.responseValue)}
                className="mt-1"
              />
              <span>
                <strong className="block font-medium">{option.label}</strong>
                <span className="mt-1 block text-sm leading-relaxed text-mk-muted">
                  {option.operationalMeaning}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {example !== null && (
          <p
            role="status"
            className="mt-4 text-base leading-relaxed text-mk-muted"
          >
            The example matches “Implemented in key areas”. This practice
            selection is not saved and does not affect your result.
          </p>
        )}
      </details>
      <div className="mt-7 flex flex-wrap gap-4">
        <Button type="button" onClick={onBegin}>
          Start the assessment
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Private link copied" : "Copy private resume link"}
        </Button>
      </div>
    </section>
  );
}
