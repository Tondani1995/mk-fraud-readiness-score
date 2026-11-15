import type { RespondentView } from './view-model';

/** A full review was 109 screens in the production live check (15 November 2026): 33 core and 74 breadth confirmations plus the profile. */
const TYPICAL_TOTAL_SCREENS = 105;
const TYPICAL_BREADTH_CONFIRMATIONS = 70;
const SECONDS_PER_QUESTION = 10;

/**
 * Overall progress for the whole review, never per stage (owner direction, 15 November 2026). It is an estimate: the
 * questions that apply depend on the answers, so the remaining count is the engine's open confirmations, plus a typical
 * breadth stage while the core stage is still running, and never less than a typical review early on.
 */
export function overallProgress(status: RespondentView['status']): { pct: number; minutesLeft: number } {
  const used = status.screensUsed;
  const st = status.stages;
  if (!st) {
    const pct = Math.min(99, status.pctOfLimit ?? 0);
    return { pct, minutesLeft: Math.max(1, Math.round(((status.limit ?? 95) - used) * SECONDS_PER_QUESTION / 60)) };
  }
  const open = st.core.open + st.breadth.open;
  const breadthPending = st.current === 'core' ? Math.max(0, TYPICAL_BREADTH_CONFIRMATIONS - st.breadth.applicableSoFar) : 0;
  // While the core stage runs the engine still counts every confirmation that might apply; the estimate stays between a
  // typical review's length and that length plus a margin.
  const typicalLeft = TYPICAL_TOTAL_SCREENS - used;
  const remaining = st.current === 'core' ? Math.max(1, typicalLeft, Math.min(open + breadthPending, typicalLeft + 15)) : Math.max(1, open);
  const pct = Math.max(1, Math.min(99, Math.round((100 * used) / (used + remaining))));
  return { pct, minutesLeft: Math.max(1, Math.round((remaining * SECONDS_PER_QUESTION) / 60)) };
}
