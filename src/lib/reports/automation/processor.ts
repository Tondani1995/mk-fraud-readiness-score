import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { generatePremiumReport } from '../premium-report-service';
import { createAiSdkPremiumReportNarrativeGenerator } from './ai-sdk-generator';
import { getPremiumReportAutomationFlags } from './feature-flags';
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
      .select('id,report_reference,version_number,supersedes_report_id,generation_run_id')
      .eq('id', fulfilment.report_id)
      .maybeSingle();
    if (reportError) throw reportError;
    if (report) {
      const { data: run, error: runError } = report.generation_run_id
        ? await db
          .from('report_generation_runs')
          .select('generation_mode,evidence_checksum')
          .eq('id', report.generation_run_id)
          .maybeSingle()
        : { data: null, error: null };
      if (runError) throw runError;
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

  const flags = await getPremiumReportAutomationFlags();
  const generator = input.generator
    ?? (flags.aiNarrativeEnabled ? createAiSdkPremiumReportNarrativeGenerator(flags.model) : undefined);

  return generatePremiumReport({
    orderReference: order.order_reference,
    fulfilmentId: fulfilment.id,
    generator,
    flags,
    actor: {
      actorType: 'system',
      action: 'automatic_workflow'
    }
  });
}
