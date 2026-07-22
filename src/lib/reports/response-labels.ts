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

/**
 * Loads every official response-scale row for a given methodology version, ordered for display.
 * Throws ResponseLabelSourceError rather than returning an empty/partial result if the source is
 * missing or empty for that methodology version -- per the spec's hard-stop requirement, callers
 * must not silently fall back to an inferred scale.
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
  if (!data || data.length === 0) {
    throw new ResponseLabelSourceError(
      `No response-scale labels found for methodology_version_id=${methodologyVersionId}. Refusing to fall back to an inferred scale.`
    );
  }

  return data.map((row: any) => ({
    responseValue: Number(row.response_value),
    label: row.label,
    operationalMeaning: row.operational_meaning,
    normalisedScore: Number(row.normalised_score),
    displayOrder: Number(row.display_order)
  }));
}

/** Finds the official label entry for a specific recorded response value, or null if unanswered. */
export function findOfficialResponseLabel(
  labels: OfficialResponseLabel[],
  value: number | null
): OfficialResponseLabel | null {
  if (value === null) return null;
  return labels.find((entry) => entry.responseValue === value) ?? null;
}
