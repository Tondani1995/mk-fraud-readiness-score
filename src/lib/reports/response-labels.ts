import { createSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * V7 Checkpoint A -- typed adapter for the official, persisted response-scale labels.
 *
 * This replaces the inferred/assumed 0-4 response scale previously hardcoded in
 * evidence-model/material-findings.ts's responseMeaning() (spec 8.2). The official source is the
 * response_scale table, keyed by methodology_version_id, confirmed present and populated for both
 * methodology versions currently in production use (MFRS-V1.0 and MFRS-V1.1) via a read-only
 * production query on 2026-07-22 (Checkpoint A verification -- see the mapping table in the
 * Checkpoint A report). That query also surfaced a real, previously-undetected defect: the actual
 * scale is 0-5 (six values), not 0-4 (five values) as material-findings.ts assumed -- so values 4
 * and 5 were being silently collapsed into a single "Fully in place" label, when they are in fact
 * two distinct official bands ("Consistently operating" vs "Embedded and improved").
 *
 * Checkpoint C wires this adapter into report assembly and the materiality engine: the complete
 * scale is loaded once for scoreRun.methodologyVersionId and passed with the evidence model. The
 * former inferred responseMeaning() mapping is no longer reachable from material findings.
 *
 * Split into two layers per the Checkpoint A correction:
 *   - validateOfficialResponseLabels(): a pure function with no I/O, so it can be exercised by
 *     deterministic, credential-free unit tests. It never repairs malformed input -- it rejects it.
 *   - getOfficialResponseLabels(): the database-loading layer, which queries response_scale and
 *     then hands the raw rows to the validator. It never returns partial or unvalidated data.
 *
 * V7 Checkpoint A FINAL correction: this repository's existing methodology loader
 * (src/lib/respondent/assessment-methodology.ts) types response_scale.normalised_score as
 * `number | string` and converts it with a permissive toNumber() helper (`Number(value)`, which
 * silently turns "" and null into 0). That is real repository evidence that PostgREST can and does
 * serialize this Postgres numeric/decimal column as a JSON string. This adapter must therefore
 * accept numeric strings for normalised_score too, but WITHOUT that permissive fallback --
 * parseFiniteDatabaseNumeric() below rejects blank, malformed, or non-numeric input outright rather
 * than coercing it into a fabricated 0. response_value and display_order are left integer-only:
 * the same loader types both of those as plain `number` (RawResponseScale), so there is no
 * repository evidence they ever arrive as strings.
 */

export interface OfficialResponseLabel {
  responseValue: number;
  label: string;
  operationalMeaning: string;
  normalisedScore: number;
  displayOrder: number;
}

export class ResponseLabelSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResponseLabelSourceError';
  }
}

// The currently supported methodology response scale is exactly these six values (0-5). Both
// production methodology versions (MFRS-V1.0, MFRS-V1.1) share this scale -- see the Checkpoint A
// mapping table. If a future methodology version legitimately introduces a different scale, this
// constant (and the validator built around it) is the single place that needs to change.
const SUPPORTED_RESPONSE_VALUES = [0, 1, 2, 3, 4, 5] as const;

// The scale's display_order values must be exactly these, in this order, once sorted -- and the
// response_value found at each of those positions must be exactly this sequence. Together these
// two constants encode "response_value N is always displayed at position N+1" -- i.e. the scale is
// not just a valid *set* of six rows, it is a valid, correctly *ordered* sequence.
const REQUIRED_DISPLAY_ORDERS = [1, 2, 3, 4, 5, 6] as const;
const REQUIRED_RESPONSE_VALUES_IN_DISPLAY_ORDER = [0, 1, 2, 3, 4, 5] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Canonical numeric string: an optional leading '-', one or more digits, and an optional '.'
// followed by one or more digits. Deliberately excludes exponential notation ("1e5"), leading '+',
// thousands separators, and the literal strings "NaN"/"Infinity" (none of which match the digit
// pattern), so those are rejected as malformed rather than silently parsed.
const CANONICAL_NUMERIC_STRING_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Strict parser for database numeric columns that PostgREST may serialize as either a JS number or
 * a numeric string (see the file-level comment above for the repository evidence). Accepts finite
 * JS numbers and canonical numeric strings representing a finite value. Rejects blank or
 * whitespace-only strings, malformed strings ("80abc"), the literal strings "NaN"/"Infinity",
 * null/undefined, booleans, arrays, and objects.
 *
 * This is intentionally NOT the same as this repo's existing toNumber() helper
 * (src/lib/respondent/assessment-methodology.ts), which uses a bare `Number(value)` and so turns
 * an empty string or null into a fabricated 0. A malformed or missing response-scale score must
 * fail loudly, not resolve to a plausible-looking zero.
 */
export function parseFiniteDatabaseNumeric(value: unknown, fieldName: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ResponseLabelSourceError(`${fieldName} is not a finite number: ${JSON.stringify(value)}.`);
    }
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new ResponseLabelSourceError(`${fieldName} is a blank string.`);
    }
    if (!CANONICAL_NUMERIC_STRING_PATTERN.test(trimmed)) {
      throw new ResponseLabelSourceError(`${fieldName} is not a canonical numeric string: ${JSON.stringify(value)}.`);
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new ResponseLabelSourceError(`${fieldName} did not parse to a finite number: ${JSON.stringify(value)}.`);
    }
    return parsed;
  }

  throw new ResponseLabelSourceError(
    `${fieldName} must be a finite number or a numeric string, got ${JSON.stringify(value)}.`
  );
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Structural scale-consistency check, run after per-row validation, duplicate/missing-value
 * checks, and sorting by display_order. Individually-valid rows can still assemble into an
 * inconsistent sequence (e.g. response_value and display_order both individually valid, but
 * paired up wrong) -- this catches that class of defect. Never hard-codes labels or operational
 * meanings; those remain database-authoritative and are not inspected here.
 */
function validateStructuralConsistency(sorted: OfficialResponseLabel[]): void {
  const displayOrders = sorted.map((entry) => entry.displayOrder);
  if (!arraysEqual(displayOrders, REQUIRED_DISPLAY_ORDERS)) {
    throw new ResponseLabelSourceError(
      `Response-scale display_order values must be exactly 1-6 in sequence; got [${displayOrders.join(', ')}].`
    );
  }

  const responseValuesInDisplayOrder = sorted.map((entry) => entry.responseValue);
  if (!arraysEqual(responseValuesInDisplayOrder, REQUIRED_RESPONSE_VALUES_IN_DISPLAY_ORDER)) {
    throw new ResponseLabelSourceError(
      `Response-scale response_value values, ordered by display_order, must be exactly 0-5 in sequence; got [${responseValuesInDisplayOrder.join(', ')}].`
    );
  }

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].normalisedScore <= sorted[i - 1].normalisedScore) {
      throw new ResponseLabelSourceError(
        `Response-scale normalised_score values must be strictly increasing by display_order; row at display_order=${sorted[i].displayOrder} (normalised_score=${sorted[i].normalisedScore}) is not greater than the previous row (normalised_score=${sorted[i - 1].normalisedScore}).`
      );
    }
  }

  const first = sorted[0];
  if (first.normalisedScore !== 0) {
    throw new ResponseLabelSourceError(
      `Response-scale must start at normalised_score 0; first row (display_order=${first.displayOrder}, response_value=${first.responseValue}) has normalised_score ${first.normalisedScore}.`
    );
  }

  const last = sorted[sorted.length - 1];
  if (last.normalisedScore !== 100) {
    throw new ResponseLabelSourceError(
      `Response-scale must end at normalised_score 100; last row (display_order=${last.displayOrder}, response_value=${last.responseValue}) has normalised_score ${last.normalisedScore}.`
    );
  }
}

/**
 * Pure validator for raw response_scale rows. Takes `unknown[]` (never `any`) so it can be
 * exercised directly by credential-free unit tests, independent of the database layer.
 *
 * Rejects -- and never silently repairs or infers around -- any of:
 *   - an empty result or a partial scale (fewer than all six required values);
 *   - a missing response value in the required 0-5 set;
 *   - a duplicate response value;
 *   - a duplicate display order;
 *   - a non-numeric or out-of-range (not 0-5) response value (numbers only -- see file header);
 *   - a blank label;
 *   - a null or blank operational meaning;
 *   - a normalised score that is not a finite number or canonical numeric string, or that is
 *     blank/malformed/out-of-range (not 0-100);
 *   - a non-integer or non-positive display order (numbers only -- see file header);
 *   - display_order values that, once sorted, are not exactly 1-6 in sequence;
 *   - response_value values that, ordered by display_order, are not exactly 0-5 in sequence
 *     (individually-valid rows assembled into an inconsistent pairing);
 *   - normalised_score values that are not strictly increasing by display_order, that do not
 *     start at 0, or that do not end at 100.
 *
 * Rows may arrive in any order; the validator does not assume the caller pre-sorted them (a
 * database query happens to ORDER BY display_order today, but this function must hold even if a
 * future caller queries without that clause, or a test fixture is hand-built out of order). Valid
 * input is deterministically normalised by sorting the returned array on display_order ascending,
 * rather than being rejected merely for arriving unordered.
 */
export function validateOfficialResponseLabels(rows: unknown[]): OfficialResponseLabel[] {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ResponseLabelSourceError(
      'Response-scale source returned no rows. Refusing to fall back to an inferred scale.'
    );
  }

  const parsed: OfficialResponseLabel[] = rows.map((row, index) => {
    if (!isPlainObject(row)) {
      throw new ResponseLabelSourceError(`Response-scale row ${index} is not a valid object.`);
    }

    const responseValue = row.response_value;
    const label = row.label;
    const operationalMeaning = row.operational_meaning;
    const rawNormalisedScore = row.normalised_score;
    const displayOrder = row.display_order;

    if (!isFiniteNumber(responseValue)) {
      throw new ResponseLabelSourceError(
        `Response-scale row ${index} has a non-numeric response_value: ${JSON.stringify(responseValue)}.`
      );
    }
    if (!Number.isInteger(responseValue) || responseValue < 0 || responseValue > 5) {
      throw new ResponseLabelSourceError(
        `Response-scale row ${index} has response_value ${responseValue} outside the supported 0-5 range.`
      );
    }
    if (!isNonBlankString(label)) {
      throw new ResponseLabelSourceError(
        `Response-scale row ${index} (response_value=${responseValue}) has a blank or missing label.`
      );
    }
    if (!isNonBlankString(operationalMeaning)) {
      throw new ResponseLabelSourceError(
        `Response-scale row ${index} (response_value=${responseValue}) has a null or blank operational_meaning.`
      );
    }

    let normalisedScore: number;
    try {
      normalisedScore = parseFiniteDatabaseNumeric(rawNormalisedScore, 'normalised_score');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ResponseLabelSourceError(
        `Response-scale row ${index} (response_value=${responseValue}) has an invalid normalised_score: ${detail}`
      );
    }
    if (normalisedScore < 0 || normalisedScore > 100) {
      throw new ResponseLabelSourceError(
        `Response-scale row ${index} (response_value=${responseValue}) has normalised_score ${normalisedScore} outside the 0-100 range.`
      );
    }

    if (!isFiniteNumber(displayOrder) || !Number.isInteger(displayOrder) || displayOrder <= 0) {
      throw new ResponseLabelSourceError(
        `Response-scale row ${index} (response_value=${responseValue}) has a non-integer or non-positive display_order: ${JSON.stringify(displayOrder)}.`
      );
    }

    return {
      responseValue,
      label,
      operationalMeaning,
      normalisedScore,
      displayOrder
    };
  });

  const seenValues = new Set<number>();
  const seenDisplayOrders = new Set<number>();
  for (const entry of parsed) {
    if (seenValues.has(entry.responseValue)) {
      throw new ResponseLabelSourceError(`Response-scale source has a duplicate response_value: ${entry.responseValue}.`);
    }
    seenValues.add(entry.responseValue);

    if (seenDisplayOrders.has(entry.displayOrder)) {
      throw new ResponseLabelSourceError(`Response-scale source has a duplicate display_order: ${entry.displayOrder}.`);
    }
    seenDisplayOrders.add(entry.displayOrder);
  }

  const missing = SUPPORTED_RESPONSE_VALUES.filter((value) => !seenValues.has(value));
  if (missing.length > 0) {
    throw new ResponseLabelSourceError(
      `Response-scale source is missing required response value(s): ${missing.join(', ')}. Refusing to fall back to an inferred scale.`
    );
  }

  if (parsed.length !== SUPPORTED_RESPONSE_VALUES.length) {
    throw new ResponseLabelSourceError(
      `Response-scale source returned ${parsed.length} rows; expected exactly ${SUPPORTED_RESPONSE_VALUES.length} (one for each of 0-5).`
    );
  }

  const sorted = [...parsed].sort((a, b) => a.displayOrder - b.displayOrder);

  validateStructuralConsistency(sorted);

  return sorted;
}

/**
 * Loads every official response-scale row for a given methodology version and validates it before
 * returning. Throws ResponseLabelSourceError -- via validateOfficialResponseLabels -- rather than
 * returning an empty/partial result if the source is missing, incomplete, or malformed for that
 * methodology version. This function never returns unvalidated data and never infers a missing
 * label.
 */
export async function getOfficialResponseLabels(methodologyVersionId: string): Promise<OfficialResponseLabel[]> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from('response_scale')
    .select('response_value, label, operational_meaning, normalised_score, display_order')
    .eq('methodology_version_id', methodologyVersionId)
    .order('display_order', { ascending: true });

  if (error) {
    throw new ResponseLabelSourceError(
      `Failed to load official response-scale labels for methodology_version_id=${methodologyVersionId}: ${error.message}`
    );
  }

  return validateOfficialResponseLabels(data ?? []);
}

/** Finds the official label entry for a specific recorded response value, or null if unanswered. */
export function findOfficialResponseLabel(
  labels: OfficialResponseLabel[],
  value: number | null
): OfficialResponseLabel | null {
  if (value === null) return null;
  return labels.find((entry) => entry.responseValue === value) ?? null;
}
