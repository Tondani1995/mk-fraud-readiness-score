import { compactAdaptiveState } from '@/lib/adaptive/state-transfer';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { buildAdaptiveVisualReviewState } from '@/lib/visual-review/fixtures';
import { previewGatewayChange } from '@/lib/adaptive/engine';
import { deriveAdaptiveAnswerDelta, buildAdaptivePostSaveState } from '@/lib/adaptive/server';

export const BENCHMARK_PROFILES = {
  instant: { latencyMs: 0, megabitsPerSecond: 100 },
  desktop: { latencyMs: 30, megabitsPerSecond: 10 },
  mobile: { latencyMs: 150, megabitsPerSecond: 1.6 },
  slow: { latencyMs: 600, megabitsPerSecond: 0.75 }
} as const;
export type BenchmarkProfile = keyof typeof BENCHMARK_PROFILES;
type Session = { state: ReturnType<typeof buildAdaptiveVisualReviewState>; expires: number; writes: number };
// Explicitly synthetic, bounded, process-local lab store. Never used by customer routes.
const reviewGlobal = globalThis as typeof globalThis & { mkBenchmarkSessions?: Map<string, Session> };
const sessions = (reviewGlobal.mkBenchmarkSessions ??= new Map<string, Session>());
export function benchmarkPublicState(state: Session['state']) {
  const { graph: _graph, guidanceByQuestion: _guidance, signals, ...publicState } = state;
  return {
    ...publicState,
    graphVersion: state.graph.graphVersion,
    graphFingerprint: state.graph.graphFingerprint,
    integritySignals: signals,
    organisation: null,
    respondent: null
  };
}
export function newBenchmarkSession(variant: 'early' | 'mid' | 'late' = 'mid') {
  for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
  if (sessions.size >= 100) sessions.delete(sessions.keys().next().value!);
  const id = crypto.randomUUID();
  const session = {
    state: buildAdaptiveVisualReviewState(variant),
    expires: Date.now() + 30 * 60_000,
    writes: 0
  };
  sessions.set(id, session);
  return { session: id, state: benchmarkPublicState(session.state) };
}
export function readBenchmarkSession(id: string) {
  const value = sessions.get(id);
  return value && value.expires > Date.now() ? value : null;
}
export async function benchmarkResponse(input: any) {
  const began = performance.now();
  let status = 200;
  let body: any;
  if (input.operation === 'reset') body = { ok: true, ...newBenchmarkSession(input.variant) };
  else {
    const session = readBenchmarkSession(input.session);
    if (!session)
      return Response.json(
        { ok: false, errors: ['Synthetic session expired. Reset the laboratory.'] },
        { status: 404 }
      );
    if (input.operation === 'read') body = { ok: true, state: benchmarkPublicState(session.state) };
    else if (input.failure === 'offline') {
      status = 503;
      body = { ok: false, errors: ['Simulated connection failure. Your selected response is retained.'] };
    } else if (
      input.failure === 'conflict' ||
      Number(input.write?.expectedSaveSequence) !== session.state.navigation.save_sequence
    ) {
      status = 409;
      body = { ok: false, reason: 'save_conflict' };
    } else {
      const write = input.write;
      const change = previewGatewayChange({
        graph: session.state.graph,
        currentAnswers: session.state.gatewayAnswers,
        nextAnswers: write.gatewayAnswers,
        controlResponses: session.state.controlResponses
      });
      if (change.requiresConfirmation && !write.confirmGatewayChange) {
        status = 409;
        body = {
          ok: false,
          reason: 'gateway_change_confirmation_required',
          affectedQuestionIds: change.affectedQuestionIds
        };
      } else {
        const delta = deriveAdaptiveAnswerDelta({
          currentGatewayAnswers: session.state.gatewayAnswers,
          currentControlResponses: session.state.controlResponses,
          nextGatewayAnswers: write.gatewayAnswers,
          nextControlResponses: write.controlResponses,
          invalidatedQuestionIds: change.affectedQuestionIds
        });
        if (!delta.ok) {
          status = 400;
          body = { ok: false, reason: delta.reason, errors: [delta.reason] };
        } else {
          session.state = buildAdaptivePostSaveState({
            current: session.state,
            saveInput: write,
            delta: delta.delta,
            invalidatedQuestionIds: change.affectedQuestionIds,
            saveSequence: session.state.navigation.save_sequence + 1,
            savedAt: new Date().toISOString()
          }) as typeof session.state;
          session.writes++;
          body = { ok: true, state: benchmarkPublicState(session.state), writes: session.writes };
        }
      }
    }
  }
  if (input.compact && body.ok && body.state?.graphFingerprint === input.fingerprint)
    body = { ...body, state: compactAdaptiveState(body.state) };
  const compute = performance.now() - began;
  const json = JSON.stringify(body);
  const wire = gzipSync(json);
  const bytes = wire.byteLength;
  const profile = BENCHMARK_PROFILES[input.profile as BenchmarkProfile] ?? BENCHMARK_PROFILES.desktop;
  const transport = profile.latencyMs + ((bytes * 8) / (profile.megabitsPerSecond * 1_000_000)) * 1000;
  await new Promise((resolve) => setTimeout(resolve, transport));
  return new Response(new Uint8Array(wire), {
    status,
    headers: {
      'Content-Encoding': 'gzip',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Server-Timing': `fixture;dur=${compute.toFixed(2)}, simulatedTransport;dur=${transport.toFixed(2)}`,
      'X-MK-Synthetic-Bytes': String(bytes),
      'X-MK-Synthetic-Writes': String(body.writes ?? 0)
    }
  });
}
