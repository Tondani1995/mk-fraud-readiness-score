import { generateManualPhase1Report, Phase1GenerationError } from '@/lib/reports/phase1-manual-fulfilment';
import { getPhase1SchemaCapability } from '@/lib/reports/phase1-schema-capability';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function triggerPaidOrderFulfilment(input: { orderReference: string; paymentEventId: string }) {
  const db = createSupabaseServiceClient() as any;
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') {
    console.info('payment_fulfilment_trigger', { orderReference: input.orderReference, outcome: 'phase1_unavailable' });
    return {
      result: 'phase1_unavailable' as const,
      message: 'Payment confirmed. Fulfilment will remain pending until the Phase 1 upgrade is activated.'
    };
  }
  try {
    const generated = await generateManualPhase1Report({
      orderReference: input.orderReference,
      requestedBy: null,
      requestKey: `payment:${input.paymentEventId}`,
      action: 'payment_confirmation'
    });
    return {
      result: generated.reusedExistingReport ? 'already_fulfilled' as const : 'queued' as const,
      message: generated.message
    };
  } catch (error) {
    if (error instanceof Phase1GenerationError && error.reason === 'generation_already_active') {
      return { result: 'already_active' as const, message: error.message };
    }
    if (error instanceof Phase1GenerationError && error.reason === 'report_already_exists') {
      return { result: 'already_fulfilled' as const, message: error.message };
    }
    if (error instanceof Phase1GenerationError && error.reason === 'phase1_schema_unavailable') {
      return { result: 'phase1_unavailable' as const, message: 'Payment confirmed. Fulfilment will remain pending until the Phase 1 upgrade is activated.' };
    }
    console.error('payment_fulfilment_trigger', { orderReference: input.orderReference, outcome: 'failed' });
    return { result: 'failed' as const, message: 'Payment was recorded, but fulfilment could not be queued. The order requires operational review.' };
  }
}
