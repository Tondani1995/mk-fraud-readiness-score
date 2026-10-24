'use client';
import { useState } from 'react';
import { buildAdaptiveVisualReviewState } from '@/lib/visual-review/fixtures';
const fixture = buildAdaptiveVisualReviewState('mid');
const question = fixture.path.activeNodes.find((node) => node.nodeId === fixture.path.currentNextNode)!;
const names = ['A · Maturity ladder', 'B · Response canvas', 'C · Guided instrument'];
export function QuestionnaireConcepts() {
  const [concept, setConcept] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="mk-product concept-review">
      <p className="clarity-eyebrow">INTERACTION STUDY · LOCAL SELECTION ONLY</p>
      <h1>Three approaches. One final instrument.</h1>
      <p>
        These prototypes use the same recorded response labels and meanings. They do not save, score or
        calculate a branch. The customer journey uses the chosen guided instrument with the canvas motion.
      </p>
      <nav aria-label="Questionnaire concepts">
        {names.map((name, index) => (
          <button
            key={name}
            aria-pressed={concept === index}
            onClick={() => {
              setConcept(index);
              setSelected(null);
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className={`concept-stage concept-${concept}`}>
        <aside>
          <span>ASSEMBLING THE ORGANISATIONAL VIEW</span>
          <strong>Fraud detection capability</strong>
          <p>Questionnaire completion only. No readiness conclusion is drawn here.</p>
        </aside>
        <section>
          <p className="clarity-eyebrow">{names[concept]}</p>
          <h2>{question.prompt}</h2>
          <fieldset>
            <legend className="sr-only">Select a maturity response</legend>
            {fixture.responseScale.map((option, index) => (
              <label
                key={option.responseValue}
                data-selected={selected === option.responseValue}
                className={selected !== null && selected !== option.responseValue ? 'prototype-receded' : ''}
              >
                <input
                  type="radio"
                  name="prototype-response"
                  checked={selected === option.responseValue}
                  onChange={() => setSelected(option.responseValue)}
                />
                <span className="concept-position" aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.operationalMeaning}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <button className="concept-unknown" onClick={() => setSelected(-1)}>
            I do not know
          </button>
          <p role="status">
            {selected !== null
              ? 'Selection shown locally. This prototype makes no persistence claim.'
              : 'Read each operational meaning before choosing.'}
          </p>
          <button onClick={() => setSelected(null)}>Reset selection</button>
        </section>
      </div>
    </div>
  );
}
