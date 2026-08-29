import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  buildCachedSnapshotNarrative as buildCachedNarrative,
  type SnapshotNarrativeCache,
  type SnapshotNarrativeCacheKey,
  type SnapshotNarrativeCacheRecord,
  type SnapshotGatewayAuth,
  type SnapshotNarrative
} from './narrative';
import type { FreeSnapshot } from './free-snapshot';
import type { CommercialSnapshotInsights } from './commercial-insights';

function cacheAdapter(): SnapshotNarrativeCache {
  const service = createSupabaseServiceClient() as any;
  return {
    async read(key: SnapshotNarrativeCacheKey): Promise<SnapshotNarrativeCacheRecord | null> {
      const { data, error } = await service
        .from('free_snapshot_narratives')
        .select('status,narrative_json,model,ai_call_count,input_tokens,output_tokens,total_tokens,provider_cost_micros,fallback_reason')
        .eq('assessment_id', key.assessmentId)
        .eq('score_run_id', key.scoreRunId)
        .eq('methodology_version', key.methodologyVersion)
        .eq('prompt_version', key.promptVersion)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        status: data.status,
        narrativeJson: data.narrative_json,
        model: data.model,
        aiCallCount: Number(data.ai_call_count ?? 0),
        inputTokens: data.input_tokens ?? undefined,
        outputTokens: data.output_tokens ?? undefined,
        totalTokens: data.total_tokens ?? undefined,
        providerCostMicros: data.provider_cost_micros ?? undefined,
        fallbackReason: data.fallback_reason ?? null
      };
    },
    async write(key: SnapshotNarrativeCacheKey, record: SnapshotNarrativeCacheRecord): Promise<void> {
      const { error } = await service.from('free_snapshot_narratives').upsert({
        assessment_id: key.assessmentId,
        score_run_id: key.scoreRunId,
        methodology_version: key.methodologyVersion,
        prompt_version: key.promptVersion,
        status: record.status,
        narrative_json: record.narrativeJson,
        model: record.model,
        ai_call_count: record.aiCallCount,
        input_tokens: record.inputTokens ?? null,
        output_tokens: record.outputTokens ?? null,
        total_tokens: record.totalTokens ?? null,
        provider_cost_micros: record.providerCostMicros ?? null,
        fallback_reason: record.fallbackReason ?? null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'assessment_id,score_run_id,methodology_version,prompt_version' });
      if (error) throw error;
    }
  };
}

export async function buildCachedSnapshotNarrative(input: {
  snapshot: FreeSnapshot;
  insights: CommercialSnapshotInsights;
  gatewayAuth?: SnapshotGatewayAuth;
}): Promise<SnapshotNarrative> {
  return buildCachedNarrative({ ...input, cache: cacheAdapter() });
}
