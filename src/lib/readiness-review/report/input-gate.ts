import { canonicalDigest } from '../canonical';
import { buildReportInput, reportInputDigest, type ReportInput } from '../report-input';
import { replay, type SessionRecord } from '../session';
import { SUPPORTED_INPUT } from './document';

/**
 * The input gate: the only door into the report engine. It accepts a report input only if it is a supported version of
 * the contract, the method still withholds scoring, its digest is what the caller expected, and, given the store, it is
 * exactly the input rebuilt from the stored answer log at the recorded position. It never repairs an input.
 */
export type GateCheck = { id: string; passed: boolean; detail: string };
export type GateResult = { ok: boolean; digest: string; checks: GateCheck[] };
export type LogSource = { load(sessionId: string): Promise<SessionRecord | null> };

const REQUIRED = ['contract', 'lineage', 'method', 'organisation', 'interview', 'profile', 'domains', 'scenarios', 'findings', 'openWork'] as const;

export async function gateInput(input: ReportInput, options: { expectedDigest?: string; store?: LogSource } = {}): Promise<GateResult> {
  const checks: GateCheck[] = [];
  const check = (id: string, passed: boolean, detail: string) => checks.push({ id, passed, detail });
  const any = input as any;

  check('contract', any?.contract?.name === SUPPORTED_INPUT.name && SUPPORTED_INPUT.versions.test(String(any?.contract?.version)), `contract ${any?.contract?.name} ${any?.contract?.version}; this engine reads ${SUPPORTED_INPUT.name} 1.1.x`);
  const missing = REQUIRED.filter((k) => any?.[k] === undefined);
  check('shape', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : 'every section present');
  check('scoring-withheld', any?.method?.scoring?.status === 'withheld', `method.scoring.status is ${any?.method?.scoring?.status}`);
  check('fictional', any?.organisation?.fictional === true, any?.organisation?.fictional === true ? 'fictional record' : 'not marked fictional: Phase 1 reads fictional records only');

  let digest = '';
  try {
    digest = reportInputDigest(input);
  } catch (error) {
    check('digest', false, `the digest could not be computed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (options.expectedDigest !== undefined) check('digest', digest === options.expectedDigest, digest === options.expectedDigest ? 'matches the expected digest' : 'differs from the expected digest');

  if (options.store) {
    const lineage = any?.lineage ?? {};
    let detail = '';
    let passed = false;
    try {
      const record = await options.store.load(lineage.sessionId);
      if (!record) detail = 'the session is not in the store';
      else if (!(Number.isInteger(lineage.actionCount) && lineage.actionCount >= 0 && lineage.actionCount <= record.actions.length)) detail = `the input claims log position ${lineage.actionCount}; the stored log has ${record.actions.length} actions`;
      else {
        const prefix = record.actions.slice(0, lineage.actionCount);
        if (canonicalDigest(prefix) !== lineage.logDigest) detail = 'the stored log prefix does not have the recorded log digest';
        else if (reportInputDigest(buildReportInput(replay({ ...record, actions: prefix }))) !== digest) detail = 'the input differs from the input rebuilt from the stored log prefix';
        else {
          passed = true;
          detail = `rebuilt from the first ${lineage.actionCount} of ${record.actions.length} stored actions with the same digest`;
        }
      }
    } catch (error) {
      detail = `the stored log could not be checked: ${error instanceof Error ? error.message : String(error)}`;
    }
    check('lineage', passed, detail);
  }

  return { ok: checks.every((c) => c.passed), digest, checks };
}
