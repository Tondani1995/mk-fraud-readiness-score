import { ARCHETYPES, type ArchetypeId } from './archetypes';
import { ENTRIES, type Entry } from './entries';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The control-content library (draft 0.1, not approved by MK): resolves a control to
 * its target operating practice, responsible function, implementation activities, records, success measure,
 * operating cycle and failure response. Where a control has no entry yet, nothing generic is substituted: the method's
 * own wording is used and the control is marked as not yet in the library.
 */
export const CONTROL_CONTENT_VERSION = 'control-content-library-0.1';
export const CONTROL_CONTENT_STATUS = 'Draft professional content for MK approval. Advisory content embedded in automated reports; not evidence review or verification.';

export type ControlContent = {
  status: 'library' | 'not-in-library';
  archetype: ArchetypeId | null; archetypeName: string | null;
  target: string | null; brief: string | null; fn: string | null; activities: string[]; record: string | null; recordName: string | null;
  measure: string | null; cycle: string | null; onFailure: string | null; population: string | null; sources: string[];
};

const BY_ID = new Map<string, Entry>(ENTRIES.map((e) => [e.id, e]));
const sentence = (t: string) => { const s = t.trim(); return s ? (/[.!?]$/.test(s) ? s : `${s}.`) : s; };
const tidy = (t: string) => sentence(t.replace(/,\s*,/g, ',').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').replace(/,\./g, '.'));

export function controlContent(id: string): ControlContent {
  const e = BY_ID.get(id);
  if (!e) {
    return { status: 'not-in-library', archetype: null, archetypeName: null, target: null, brief: null, fn: null, activities: [], record: null, recordName: null, measure: null, cycle: null, onFailure: null, population: null, sources: [] };
  }
  const a = ARCHETYPES[e.a];
  return {
    status: 'library', archetype: e.a, archetypeName: a.name, target: sentence(e.target), brief: (e.brief ?? e.target).replace(/\.$/, ''), fn: e.fn ?? null,
    activities: (e.activities ?? a.activities(e)).map(tidy),
    record: tidy(a.record(e)), recordName: e.record,
    measure: tidy(e.measure ?? a.measure(e)), cycle: e.cycle, onFailure: tidy(e.onFailure ?? a.onFailure(e)), population: e.units, sources: e.src
  };
}

export const libraryIds = () => [...BY_ID.keys()];
export { ARCHETYPES, ENTRIES };
