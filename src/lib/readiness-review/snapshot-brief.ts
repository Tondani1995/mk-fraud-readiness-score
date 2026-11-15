import type { snapshotView, ControlItem, WaitingProvenance } from './view-model';

/**
 * The facts the customer Snapshot shows and the AI narrative may use, derived once from the Snapshot view so the page,
 * the narrative and its checks can never disagree on a number (owner direction, 15 November 2026).
 */
type Snapshot = ReturnType<typeof snapshotView>;
export type ReportTier = 'essential' | 'comprehensive' | 'advisory';

export type AreaFigures = { name: string; gaps: number; inPlace: number; unknown: number; gapTitles: string[] };
export type SnapshotBrief = {
  organisation: string;
  score: { percent: number; counted: number; applicable: number; gapScenarios: number; coverageMet: boolean } | null;
  scenariosInPlace: number | null;
  unknown: number;
  controlsAsked: number;
  gapsReported: number;
  inPlaceReported: number;
  areas: AreaFigures[];
  areasWithGaps: number;
  strongest: { name: string; inPlace: number } | null;
  recommendation: { tier: ReportTier; reason: string };
};

type AvailableScore = { available: true; percent: number; counted: number; applicable: number; gapScenarios: number; coverageMet: boolean };
export function availableScore(view: Snapshot): AvailableScore | null {
  const s = view.score as unknown as AvailableScore | { available: false } | null;
  return s && s.available ? s : null;
}

export function unknownItems(view: Snapshot): ControlItem[] {
  return view.waiting.filter((w: ControlItem & { provenance?: WaitingProvenance }) => w.provenance?.kind === 'respondent-unknown');
}

function byArea(items: ControlItem[]) {
  const map = new Map<string, ControlItem[]>();
  for (const item of items) {
    if (!map.has(item.area)) map.set(item.area, []);
    map.get(item.area)!.push(item);
  }
  return map;
}

export function recommend(score: SnapshotBrief['score'], areasWithGaps: number): SnapshotBrief['recommendation'] {
  if (!score || !score.coverageMet) {
    return {
      tier: 'advisory',
      reason: 'Too much of the assessment is still open for a report to be written from it honestly. A short conversation with MK is the better next step: we can tell you what would close the open questions and which report would then suit you.'
    };
  }
  const share = score.counted ? score.gapScenarios / score.counted : 0;
  if (share >= 0.4 || areasWithGaps >= 6) {
    return {
      tier: 'comprehensive',
      reason: `Your answers report a core-control gap in ${score.gapScenarios} of the ${score.counted} fraud scenarios counted, across ${areasWithGaps} areas. When weaknesses are this widespread, the useful question is what the control environment should look like and who owns each part of it, which is what Comprehensive designs.`
    };
  }
  return {
    tier: 'essential',
    reason: `Your answers report a core-control gap in ${score.gapScenarios} of the ${score.counted} fraud scenarios counted, concentrated in ${areasWithGaps} ${areasWithGaps === 1 ? 'area' : 'areas'}. Essential explains what each gap means for prevention and detection and sets out what to fix first.`
  };
}

export function buildSnapshotBrief(view: Snapshot): SnapshotBrief {
  const s = availableScore(view);
  const unknown = unknownItems(view);
  const gaps = byArea(view.reportedGaps);
  const inPlace = byArea(view.reportedInPlace);
  const unknownByArea = byArea(unknown);
  const names = [...new Set([...gaps.keys(), ...inPlace.keys(), ...unknownByArea.keys()])];
  const areas: AreaFigures[] = names
    .map((name) => ({
      name,
      gaps: gaps.get(name)?.length ?? 0,
      inPlace: inPlace.get(name)?.length ?? 0,
      unknown: unknownByArea.get(name)?.length ?? 0,
      gapTitles: (gaps.get(name) ?? []).map((g) => g.title)
    }))
    .sort((a, b) => b.gaps - a.gaps || a.name.localeCompare(b.name));
  const areasWithGaps = areas.filter((a) => a.gaps > 0).length;
  const strongestArea = [...areas].filter((a) => a.inPlace > 0).sort((a, b) => b.inPlace - b.gaps - (a.inPlace - a.gaps))[0] ?? null;
  const score = s ? { percent: s.percent, counted: s.counted, applicable: s.applicable, gapScenarios: s.gapScenarios, coverageMet: s.coverageMet } : null;
  return {
    organisation: view.organisationLabel,
    score,
    scenariosInPlace: score ? Math.max(0, score.counted - score.gapScenarios) : null,
    unknown: unknown.length,
    controlsAsked: view.reportedGaps.length + view.reportedInPlace.length + unknown.length,
    gapsReported: view.reportedGaps.length,
    inPlaceReported: view.reportedInPlace.length,
    areas,
    areasWithGaps,
    strongest: strongestArea ? { name: strongestArea.name, inPlace: strongestArea.inPlace } : null,
    recommendation: recommend(score, areasWithGaps)
  };
}
