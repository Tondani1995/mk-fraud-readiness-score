'use client';
import { useCallback, useRef, useState } from 'react';
import { AdaptiveAssessmentExperience } from '@/components/adaptive/AdaptiveAssessmentExperience';
import { buildAdaptiveVisualReviewState } from '@/lib/visual-review/fixtures';
import { resolveAdaptivePath } from '@/lib/adaptive/engine';

/** In-memory transport double. Never sends a request or stores data beyond this mounted component. */
export function AssessmentInteractionReview() {
  const [variant, setVariant] = useState<'early' | 'mid' | 'late'>('mid');
  const [generation, setGeneration] = useState(0);
  const [mode, setMode] = useState('success');
  const modeRef = useRef(mode);
  const saved = useRef(buildAdaptiveVisualReviewState(variant));
  const transport = useCallback<typeof fetch>(async (_input, init) => {
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (!init?.method || init.method === 'GET') return reply({ ok: true, state: saved.current });
    const body = JSON.parse(String(init.body));
    const currentMode = modeRef.current;
    if (currentMode !== 'success') {
      modeRef.current = 'success';
      setMode('success');
    }
    if (currentMode === 'offline') throw new TypeError('Synthetic offline failure');
    if (currentMode === 'conflict') return reply({ ok: false, reason: 'save_conflict' }, 409);
    if (currentMode === 'scope-change' && !body.confirmGatewayChange)
      return reply({ ok: false, reason: 'gateway_change_confirmation_required' }, 409);
    const path = resolveAdaptivePath({
      graph: saved.current.graph,
      gatewayAnswers: body.gatewayAnswers,
      controlResponses: body.controlResponses
    });
    saved.current = {
      ...saved.current,
      gatewayAnswers: body.gatewayAnswers,
      controlResponses: body.controlResponses,
      path,
      navigation: {
        ...saved.current.navigation,
        save_sequence: saved.current.navigation.save_sequence + 1,
        current_question_id: path.currentNextNode,
        current_screen: path.currentNextNode ? 'question' : 'review',
        visited_question_ids: body.visitedQuestionIds,
        last_saved_at: new Date().toISOString()
      }
    };
    return reply({ ok: true, state: saved.current });
  }, []);
  function reset(next: typeof variant) {
    saved.current = buildAdaptiveVisualReviewState(next);
    setVariant(next);
    setGeneration((value) => value + 1);
  }
  return (
    <div className="mk-product mx-auto max-w-4xl px-[18px] py-8">
      <aside className="mb-6 border border-mk-line bg-white p-4 text-sm leading-6">
        <p className="font-semibold">Local interaction laboratory</p>
        <p>
          Real assessment component with an in-memory transport double. This checks UI progression and
          recovery only. Reloading the page resets it. No database, assessment submission, payment or message
          is sent.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(['early', 'mid', 'late'] as const).map((value) => (
            <button className="min-h-11 border border-mk-line px-3" key={value} onClick={() => reset(value)}>
              Load {value}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          Next save response{' '}
          <select
            className="ml-2 min-h-11 border border-mk-line"
            value={mode}
            onChange={(event) => {
              modeRef.current = event.target.value;
              setMode(event.target.value);
            }}
          >
            <option value="success">Success</option>
            <option value="offline">Offline once</option>
            <option value="conflict">Save conflict once</option>
            <option value="scope-change">Scope confirmation once</option>
          </select>
        </label>
      </aside>
      <AdaptiveAssessmentExperience
        key={`${variant}-${generation}`}
        assessmentReference="INTERACTION-REVIEW"
        token="local-double"
        initialState={saved.current}
        visualReview
        reviewTransport={transport}
      />
    </div>
  );
}
