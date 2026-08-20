-- Complete the G24 service-role boundary: adaptive content and history writes are
-- owned by SECURITY DEFINER RPCs; the application service role needs read access only.
revoke insert, update on
  public.adaptive_graph_versions,
  public.assessment_answer_history,
  public.assessment_applicability_profiles,
  public.assessment_integrity_signals,
  public.assessment_evidence_guidance
from service_role;
grant select on
  public.adaptive_graph_versions,
  public.assessment_answer_history,
  public.assessment_applicability_profiles,
  public.assessment_integrity_signals,
  public.assessment_evidence_guidance
to service_role;
