import type { CommercialProjection } from '../commercial-projection';
import { severityToken, type MkSeverity } from '../design/tokens';

export type ExhibitId = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8' | 'E9' | 'E10';

export type ExhibitResult = {
  id: ExhibitId;
  title: string;
  source: string;
  html: string;
  criticalCount: number;
  majorCount: number;
  requiredFields: string[];
};

export type DomainDatum = { code: string; name: string; score: number | null; controlCount?: number };
export type SlopeDatum = { label: string; score: number; period?: string };
export type OptionDatum = {
  id: string;
  title: string;
  decision: string;
  owner: string;
  timing: string;
  tradeOff: string;
  cost?: string;
  benefit?: string;
  rejectionReason?: string;
  recommendation?: string;
  rationale?: string;
};

export type ExhibitContext = {
  projection: CommercialProjection;
  domains?: DomainDatum[];
  slope?: SlopeDatum[];
  options?: OptionDatum[];
  source?: string;
};

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function severityBadge(label: string, severity: MkSeverity = 'neutral'): string {
  return `<span class="mk-severity" style="color:${severityToken(severity)}">${escapeHtml(label)}</span>`;
}

export function exhibitResult(
  id: ExhibitId,
  title: string,
  html: string,
  source: string,
  requiredFields: string[],
  criticalCount = 0,
  majorCount = 0
): ExhibitResult {
  if (!title || /\b(is|are|was|were)\b/i.test(title)) throw new Error(`${id} title must use a finite action verb`);
  if (!source.trim()) throw new Error(`${id} must include a source line`);
  return { id, title, source, html: `${html}<p class="mk-source">Source: ${escapeHtml(source)}</p>`, criticalCount, majorCount, requiredFields };
}
