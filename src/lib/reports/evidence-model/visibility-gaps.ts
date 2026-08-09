import { stableToken } from './deterministic';
import type { AssembledReportData } from '../types';
import type { VisibilityGap } from './types';

export function buildVisibilityGaps(data: AssembledReportData): VisibilityGap[] {
  const metrics = data.adaptiveScope;
  if (!metrics || metrics.exposureAssessed !== false) return [];
  return (metrics.visibilityGaps ?? []).map((gap) => ({
    ...gap,
    evidenceRef: `evidence:VIS-${stableToken(gap.questionCode)}`
  }));
}
