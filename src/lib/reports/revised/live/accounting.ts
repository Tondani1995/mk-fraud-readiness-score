/**
 * Paid-call accounting for revised report generation (independent review of the corrective pass, finding F1).
 *
 * Every AI call is reserved in the review store BEFORE it is dispatched (`review_reserve_generation_call`), counted
 * from that moment whatever happens next, and settled afterwards with its usage. The store, not the application,
 * enforces the limits under locks:
 *
 *   order     every call ever reserved for the order, across attempts and report versions (a lifetime limit), at most
 *             APPROVED_ORDER_CALL_CEILING; MK_REVISED_ORDER_CALL_CEILING may lower it, never raise it;
 *   campaign  an owner-approved number of calls and cost (`generation_budgets`). Without an approved campaign no paid
 *             call is possible. Cost is charged at the call's worst case until its usage is known; a call whose
 *             outcome is unknown (timeout, crash, lost response) stays at its worst case.
 *
 * If the store cannot be reached, answers with an error or answers with something malformed, the call is refused:
 * unavailable accounting never becomes a fresh allowance.
 */
export const REVISED_ACCOUNTING_VERSION = 'revised-accounting-1.0';

/** The approved bound on AI calls per order over its lifetime (all attempts and report versions). */
export const APPROVED_ORDER_CALL_CEILING = 6;

/** The order ceiling in force: the approved bound, or a lower configured value. An unreadable setting gives the minimum. */
export function orderCallCeiling(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MK_REVISED_ORDER_CALL_CEILING;
  if (raw === undefined || raw.trim() === '') return APPROVED_ORDER_CALL_CEILING;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, APPROVED_ORDER_CALL_CEILING);
}

/**
 * List prices per token used to bound a call's cost before it is made (Vercel AI Gateway, read 13 November 2026; for
 * gpt-5.6-terra the highest regional price). A model not listed here cannot be costed, so it cannot be called.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'openai/gpt-5-mini': { input: 0.00000025, output: 0.000002 },
  'openai/gpt-5.6-terra': { input: 0.0000022, output: 0.0000132 }
};

/** Output caps that bound each call's cost. A full manuscript is about 8,000 tokens; the caps leave room for reasoning. */
export const MAX_OUTPUT_TOKENS = { writer: 48_000, repairLines: 12_000, repairFull: 48_000 } as const;

const up4 = (x: number) => Math.ceil(x * 10_000) / 10_000;

/** Worst-case cost: input estimated at one token per three characters (prose averages nearer four), plus 10%. */
export function worstCaseCostUsd(model: string, promptChars: number, maxOutputTokens: number): number | null {
  const p = MODEL_PRICES[model];
  if (!p || !Number.isFinite(promptChars) || !Number.isFinite(maxOutputTokens)) return null;
  return up4((Math.ceil(promptChars / 3) * p.input + maxOutputTokens * p.output) * 1.1);
}

/** Cost from the usage the provider reported, or null when the usage is missing or unreadable. */
export function costFromUsage(model: string, usage: unknown): number | null {
  const p = MODEL_PRICES[model];
  if (!p || !usage || typeof usage !== 'object') return null;
  const u = usage as Record<string, unknown>;
  const input = Number(u.inputTokens ?? u.promptTokens);
  const output = Number(u.outputTokens ?? u.completionTokens);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return up4(input * p.input + output * p.output);
}

export type RefusalReason = 'accounting_unavailable' | 'campaign_budget_missing' | 'order_ceiling_reached' | 'campaign_calls_exhausted' | 'campaign_cost_exhausted' | 'cost_not_bounded';
const REASONS: RefusalReason[] = ['campaign_budget_missing', 'order_ceiling_reached', 'campaign_calls_exhausted', 'campaign_cost_exhausted', 'cost_not_bounded'];

export class AccountingRefusal extends Error {
  readonly reason: RefusalReason;
  readonly detail: Record<string, unknown>;
  constructor(reason: RefusalReason, detail: Record<string, unknown> = {}) {
    super(`AI call refused: ${reason}`);
    this.name = 'AccountingRefusal';
    this.reason = reason;
    this.detail = detail;
  }
}

export type Reservation = { callId: string; orderCalls: number; orderCeiling: number; campaignCalls: number; maxCalls: number; committedUsd: number; maxCostUsd: number };
export type CallAccounting = {
  /** Reserves one paid call; throws AccountingRefusal when it is not allowed or cannot be accounted for. */
  reserve(request: { stage: 'writer' | 'repair'; model: string; maxOutputTokens: number; reservedCostUsd: number }): Promise<Reservation>;
  /** Records the outcome. A failed settlement leaves the call counted at its worst case; it never frees allowance. */
  settle(callId: string, outcome: 'succeeded' | 'failed' | 'indeterminate', usage: unknown, costUsd: number | null): Promise<boolean>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function databaseAccounting(db: any, scope: { campaign: string | null; orderReference: string; inputDigest: string; attemptId: string; orderCeiling: number }): CallAccounting {
  return {
    async reserve(request) {
      let data: any;
      try {
        const out = await db.rpc('review_reserve_generation_call', {
          p: { campaign: scope.campaign, orderReference: scope.orderReference, inputDigest: scope.inputDigest, attemptId: scope.attemptId, orderCeiling: scope.orderCeiling, ...request }
        });
        if (out?.error) throw new AccountingRefusal('accounting_unavailable', { error: String(out.error.message ?? 'error').slice(0, 200) });
        data = out?.data;
      } catch (error) {
        if (error instanceof AccountingRefusal) throw error;
        throw new AccountingRefusal('accounting_unavailable', { error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' });
      }
      if (!data || typeof data !== 'object' || typeof data.allowed !== 'boolean') throw new AccountingRefusal('accounting_unavailable', { malformed: true });
      if (!data.allowed) {
        if (!REASONS.includes(data.reason)) throw new AccountingRefusal('accounting_unavailable', { malformed: true, reason: data.reason ?? null });
        throw new AccountingRefusal(data.reason, data);
      }
      if (typeof data.callId !== 'string' || !UUID.test(data.callId)) throw new AccountingRefusal('accounting_unavailable', { malformed: true });
      return { callId: data.callId, orderCalls: Number(data.orderCalls), orderCeiling: Number(data.orderCeiling), campaignCalls: Number(data.campaignCalls), maxCalls: Number(data.maxCalls), committedUsd: Number(data.committedUsd), maxCostUsd: Number(data.maxCostUsd) };
    },
    async settle(callId, outcome, usage, costUsd) {
      try {
        const { data, error } = await db.rpc('review_settle_generation_call', { p: { callId, status: outcome, usage: usage ?? null, costUsd } });
        if (error) { console.warn('revised_call_settlement_failed', { callId, message: error.message }); return false; }
        return data?.settled === true;
      } catch (error) {
        console.warn('revised_call_settlement_failed', { callId, message: error instanceof Error ? error.message : 'unknown' });
        return false;
      }
    }
  };
}
