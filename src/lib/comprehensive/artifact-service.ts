import { createSupabaseServiceClient } from '@/lib/supabase/server';

function service() {
  return createSupabaseServiceClient() as any;
}

export async function finaliseComprehensiveArtifactSet(input: { engagementId: string; reportId: string; artifactVersion?: number; actorAdminUserId: string }) {
  const { data, error } = await service().rpc('finalise_comprehensive_artifact_set', {
    p_engagement_id: input.engagementId,
    p_report_id: input.reportId,
    p_artifact_version: input.artifactVersion ?? 1,
    p_actor_admin_user_id: input.actorAdminUserId
  });
  if (error || !data?.ok) throw new Error(error?.message ?? 'Comprehensive artifact set finalisation failed.');
  return { engagementId: data.engagement_id as string, reportId: data.report_id as string, artifactVersion: Number(data.artifact_version) };
}
