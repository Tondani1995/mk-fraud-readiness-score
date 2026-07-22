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
 * This adapter is additive only. It is not yet wired into material-findings.ts or any rendering
 * path -- that replacement is explicitly out of scope for Checkpoint A (see "no rendering redesign,
 * no new report prose, no broad template changes") and belongs to a later checkpoint once this
 * adapter itself has been reviewed and approved.
 *
 * Split into two layers per the Checkpoint A correction:
 *   - validateOfficialResponseLabels(): a pure function with no I/O, so it can be exercised by
 *     deterministic, credential-free unit tests. It never repairs malformed input -- it rejects it.
 *   - getOfficialResponseLabels(): the database-loading layer, which queries response_scale and
 *     then hands the raw rows to the validator. It never returns partial or unvalidated data.
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
 *   - a non-numeric or out-of-range (not 0-5) response value;
 *   - a blank label;
 *   - a null or blank operational meaning;
 *   - a non-numeric or out-of-range (not 0-100) normalised score;
 *   - a non-integer or non-positive display order.
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
    const normalisedScore = row.normalised_score;
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
    if (!isFiniteNumber(normalisedScore)) {
      throw new ResponseLabelSourceError(
        `Response-scale row ${index} (response_value=${responseValue}) has a non-numeric normalised_score: ${JSON.stringify(normalisedScore)}.`
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

  return [...parsed].sort((a, b) => a.displayOrder - b.displayOrder);
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
