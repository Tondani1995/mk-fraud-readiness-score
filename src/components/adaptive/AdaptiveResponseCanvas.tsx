"use client";
import { useEffect, useId, useState } from "react";
export type ResponseChoice = {
  value: string;
  label: string;
  meaning?: string;
  uncertain?: boolean;
};

function ResponseSlot({
  choice,
  selected,
  saving,
  collapsing,
  confirmed,
  name,
  onChoose,
}: {
  choice: ResponseChoice;
  selected: boolean;
  saving: boolean;
  collapsing: boolean;
  confirmed: boolean;
  name: string;
  onChoose: (value: string) => void;
}) {
  const [removed, setRemoved] = useState(false);
  const id = useId();
  const exiting = collapsing && !selected;
  const scaleLevel =
    choice.meaning && !choice.uncertain && /^[0-5]$/.test(choice.value)
      ? Number(choice.value)
      : null;
  useEffect(() => {
    if (!exiting) setRemoved(false);
    else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      setRemoved(true);
  }, [exiting]);
  return (
    <div
      className="answer-slot"
      data-uncertain={choice.uncertain ? 'true' : undefined}
      data-exiting={exiting ? "true" : undefined}
      aria-hidden={exiting ? true : undefined}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "grid-template-rows" &&
          exiting
        )
          setRemoved(true);
      }}
    >
      {!removed && (
        <div className="answer-slot-inner">
          <div
            className={`answer-option${choice.uncertain ? " answer-unknown" : ""}`}
            data-selected={selected ? "true" : undefined}
          >
            <label className="answer-label">
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={selected}
                onChange={() => onChoose(choice.value)}
                disabled={saving}
                aria-describedby={choice.meaning ? id : undefined}
              />
              <span className="answer-selector" aria-hidden="true">
                {selected ? (
                  "✓"
                ) : choice.uncertain ? (
                  "?"
                ) : scaleLevel !== null ? (
                  <span className="flex h-4 items-end gap-[2px]">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <i
                        key={step}
                        className={`block w-[3px] rounded-sm ${step <= scaleLevel ? "bg-mk-accent" : "bg-mk-line"}`}
                        style={{ height: `${5 + step * 2}px` }}
                      />
                    ))}
                  </span>
                ) : (
                  "→"
                )}
              </span>
              <span className="answer-title pr-5">
                {choice.label}
                {selected && confirmed && (
                  <small className="answer-saved-confirmation">Saved</small>
                )}
              </span>
              {choice.meaning && (
                <span className="answer-meaning-inline" id={id}>
                  {choice.meaning}
                </span>
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-4 top-4 text-sm text-mk-muted"
              >
                {selected ? "" : "↗"}
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/** Native radio semantics remain intact. A pending write physically collapses other options;
 * no timer or animation completion is ever allowed to advance the authoritative question.
 */
export function AdaptiveResponseCanvas({
  choices,
  selected,
  saving,
  collapsing = saving,
  confirmed = false,
  onChoose,
  name,
  legend,
}: {
  choices: ResponseChoice[];
  selected: string | null;
  saving: boolean;
  collapsing?: boolean;
  confirmed?: boolean;
  onChoose: (value: string) => void;
  name: string;
  legend: string;
}) {
  return (
    <fieldset
      className="response-canvas"
      disabled={saving}
      data-saving={saving ? "true" : undefined}
    >
      <legend className="sr-only">{legend}</legend>
      <div className="response-grid">
        {choices.map((choice) => (
          <ResponseSlot
            key={choice.value}
            choice={choice}
            selected={selected === choice.value}
            saving={saving}
            collapsing={collapsing}
            confirmed={confirmed}
            onChoose={onChoose}
            name={name}
          />
        ))}
      </div>
      <p className="selection-instruction">
        Choose a response to save and continue.
      </p>
    </fieldset>
  );
}
