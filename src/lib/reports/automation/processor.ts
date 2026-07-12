import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { generatePremiumReport } from '../premium-report-service';
import type { PremiumReportNarrativeGenerator } from './types';

export async function processPremiumReportFulfilment(input: {
  fulfilmentId: string;
  generator?: PremiumReportNarrativeGenerator;
}) {
  const db = createSupabaseServiceClient() as any;
  const { data: fulfilment, error } = await db
    .from('report_fulfilments')
    .select('id,status,report_id,orders:order_id(order_reference)')
    .eq('id', input.fulfilmentId)
    .maybeSingle();

  if (error) throw error;
  if (!fulfilment) throw new Error(`Fulfilment ${input.fulfilmentId} was not found.`);

  const order = Array.isArray(fulfilment.orders) ? fulfilment.orders[0] : fulfilment.orders;
  if (!order?.order_reference) throw new Error(`Fulfilment ${input.fulfilmentId} has no linked order reference.`);

  if (fulfilment.report_id && ['ready_for_delivery', 'completed'].includes(fulfilment.status)) {
    const { data: report, error: reportError } = await db
      .from('reports')
      .select('id,report_reference,version_number,supersedes_report_id,generation_run_id,report_generation_runs:generation_run_id(generation_mode,evidence_checksum)')
      .eq('id', fulfilment.report_id)
      .maybeSingle();
    if (reportError) throw reportError;
    if (report) {
      const run = Array.isArray(report.report_generation_runs)
        ? report.report_generation_runs[0]
        : report.report_generation_runs;
      return {
        reportId: report.id,
        reportReference: report.report_reference,
        versionNumber: Number(report.version_number),
        supersededReportId: report.supersedes_report_id ?? null,
        generationMode: run?.generation_mode ?? 'deterministic_fallback',
        evidenceChecksum: run?.evidence_checksum ?? 'legacy-report-no-generation-run',
        readyForEmailDelivery: true as const,
        reusedExistingReport: true
      };
    }
  }

  if (fulfilment.status === 'cancelled') throw new Error(`Fulfilment ${input.fulfilmentId} is cancelled.`);

  return generatePremiumReport({
    orderReference: order.order_reference,
    fulfilmentId: fulfilment.id,
    generator: input.generator,
    actor: {
      actorType: 'system',
      action: 'automatic_workflow'
    }
  });
}
