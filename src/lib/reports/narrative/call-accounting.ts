import type { NarrativeStoryPlan } from './story-plan';

export type NarrativeAiCallPhase = 'spine' | 'section' | 'coherence' | 'repair';

export interface NarrativeAiCallRecord {
  sequence: number;
  phase: NarrativeAiCallPhase;
  sectionId?: string;
  attempt: number;
  status: 'started' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  generationId?: string;
  responseId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  error?: string;
}

export interface NarrativeAiCallAccountingSnapshot {
  sectionCount: number;
  expectedNormalCalls: number;
  records: NarrativeAiCallRecord[];
}

export interface NarrativeAiCallAccountingOptions {
  onAnnouncement?: (message: string) => void;
}

function sectionCount(plan: NarrativeStoryPlan): number {
  return plan.movements.reduce((count, movement) => count + movement.sectionIds.length, 0);
}

/**
 * Opt-in owner-review accounting for the v1.1 writer. It has no provider side effects and is
 * deliberately separate from the manuscript contract so certification runners can persist it.
 */
export class NarrativeAiCallAccounting {
  private readonly records: NarrativeAiCallRecord[] = [];
  private readonly onAnnouncement: (message: string) => void;
  private announced = false;
  private sequence = 0;
  private attempt = 0;
  private planShape?: { sectionCount: number; expectedNormalCalls: number };

  constructor(options: NarrativeAiCallAccountingOptions = {}) {
    this.onAnnouncement = options.onAnnouncement ?? ((message) => console.log(message));
  }

  announceBeforeLiveCall(plan: NarrativeStoryPlan): void {
    const count = sectionCount(plan);
    this.planShape = { sectionCount: count, expectedNormalCalls: count + 2 };
    if (this.announced) return;
    this.announced = true;
    this.onAnnouncement(`v1.1 AI call budget: ${count} Story Plan sections / ${count + 2} expected normal calls (spine + sections + coherence).`);
  }

  start(phase: NarrativeAiCallPhase, sectionId?: string): NarrativeAiCallRecord {
    this.sequence += 1;
    if (phase === 'spine') this.attempt += 1;
    const record: NarrativeAiCallRecord = { sequence: this.sequence, phase, sectionId, attempt: this.attempt || 1, status: 'started', startedAt: new Date().toISOString() };
    this.records.push(record);
    return record;
  }

  complete(record: NarrativeAiCallRecord, input: { generationId?: string; responseId?: string; inputTokens?: number; outputTokens?: number; totalTokens?: number; providerCostMicros?: number }): void {
    Object.assign(record, input, { status: 'completed', completedAt: new Date().toISOString() });
  }

  fail(record: NarrativeAiCallRecord, error: unknown): void {
    Object.assign(record, { status: 'failed', completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
  }

  snapshot(): NarrativeAiCallAccountingSnapshot {
    const planShape = this.planShape ?? { sectionCount: 0, expectedNormalCalls: 0 };
    return { ...planShape, records: this.records.map((record) => ({ ...record })) };
  }
}
