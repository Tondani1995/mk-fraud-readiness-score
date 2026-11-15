// Type surface for review engine build 1.6 (staged completion; fictional harness only). Build 1.6 composes build 1.5
// unchanged and adds the members below. It produces no score.
import type { EngineInstance } from './review-engine-build-1.5.cjs';

export type DepthSelection = 'none' | 'recommended' | string[];
export type DepthCandidate = { id: string; kind: 'follow-up' | 'diagnostic' | 'coverage' | 'gate'; scenario: string; tier: number; gain: number; objective: string | null; fn: string; owner: string; opens?: number };

export type StagedEngineInstance = EngineInstance & {
  build: '1.6';
  ownerDecline(qid: string, by: string, reason?: string): unknown;
  planFollowUp(meta?: { by?: string; depth?: DepthSelection }): string[];
  stages(report?: any): any;
  consistencySummary(): any;
  depthCandidates(): DepthCandidate[];
  selectDepth(): DepthCandidate[];
  OUTCOME_LABEL: Record<string, string>;
};

declare const REVIEW16: {
  create(bank: unknown, coverage: unknown, options?: { now?: () => string; consistency?: { tiers?: number[]; perDomain?: number; max?: number }; depth?: { perFunction?: number; perScenario?: number; coveragePerObjective?: number; minGain?: number } }): StagedEngineInstance;
  CLASSES: string[];
  ISSUE: string[];
  BUILD: '1.6';
  COMPOSES: '1.5';
};

export default REVIEW16;
