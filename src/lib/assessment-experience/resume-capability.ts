import { createSupabaseServiceClient } from '@/lib/supabase/server';

export type AssessmentResumeCapability = {
  status: 'available' | 'unavailable' | 'error';
  schemaVersion: '0025' | null;
  message: string | null;
};

export async function getAssessmentResumeCapability(db = createSupabaseServiceClient() as any): Promise<AssessmentResumeCapability> {
  const { data: marker, error: markerError } = await db.from('app_settings').select('value_json')
    .eq('setting_key', 'v2_phase23_assessment_resume').maybeSingle();
  if (markerError) return { status: 'error', schemaVersion: null, message: 'Assessment resume capability could not be verified.' };
  if (marker?.value_json?.schema_version !== '0025') {
    return { status: 'unavailable', schemaVersion: null, message: 'Assessment navigation resume is using answer-derived compatibility mode.' };
  }
  const { data, error } = await db.rpc('assessment_resume_capability');
  if (error || !data || data.status === 'error') return { status: 'error', schemaVersion: '0025', message: 'Assessment resume capability could not be verified.' };
  if (data.available !== true) return { status: 'unavailable', schemaVersion: '0025', message: 'Assessment navigation resume is using answer-derived compatibility mode.' };
  return { status: 'available', schemaVersion: '0025', message: null };
}
