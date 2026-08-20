-- RC1: extend the provider-attestation immutability guard with the synthetic-cleanup allowance.
--
-- Defect
-- ------
-- 20260801070000 taught the cleanup to find attestations by both of their routes, but finding
-- them is not the same as being allowed to remove them. guard_phase14_provider_attestation_immutable
-- refuses every UPDATE and DELETE on public.phase14_provider_attestations unconditionally:
--
--   P0001  phase14_provider_attestation_immutable
--
-- So the cleanup resolved the right rows and was then refused by the trigger, and the surviving
-- attestations went on to block the email_events delete with the same 23503 as before. The route
-- reported it as `unclassified`, which is correct for an unrecognised database error.
--
-- This is the same class of gap already corrected for score runs, score traces and locked answers
-- in 20260730130000 and 20260731150000: an immutability guard that is right for ordinary
-- operation and has no notion of an audited synthetic-certification cleanup.
--
-- Correction
-- ----------
-- The guard gains the identical allowance and nothing else. A DELETE is permitted only when BOTH
--
--   1. the transaction-local marker rc1.synthetic_cleanup_ref is set, which only
--      rc1_cleanup_synthetic_certification sets and only for its own transaction; and
--   2. provenance is proven from the attestation row itself, through either of its two links --
--      the delivery authorisation or the email event -- to an organisation whose
--      synthetic_certification_ref equals the marker.
--
-- synthetic_certification_ref carries a CHECK constraining it to ^MKTEST-RC1-<yyyymmdd>-<nn>$, so
-- matching against it is what confines the allowance to synthetic certification data.
--
-- UPDATE is deliberately not relaxed. An attestation records what a provider asserted; the
-- cleanup removes journeys, it never rewrites evidence. An attestation that cannot prove its
-- provenance is still refused, exactly as before.

begin;

create or replace function public.guard_phase14_provider_attestation_immutable()
returns trigger language plpgsql set search_path=''
as $$
declare
  v_cleanup_ref text;
  v_synthetic_ref text;
begin
  if tg_op = 'DELETE' then
    v_cleanup_ref := pg_catalog.current_setting('rc1.synthetic_cleanup_ref', true);
    if v_cleanup_ref is not null and v_cleanup_ref <> '' then
      select o.synthetic_certification_ref into v_synthetic_ref
      from public.organisations o
      where o.id in (
        -- Route 1: the delivery authorisation this attestation was recorded against.
        select a.organisation_id
        from public.report_delivery_authorizations d
        join public.assessments a on a.id = d.assessment_id
        where d.id = old.authorization_id
        union
        -- Route 2: the email event a signed provider callback was recorded against.
        select a.organisation_id
        from public.email_events e
        join public.assessments a on a.id = e.assessment_id
        where e.id = old.email_event_id
      )
        and o.synthetic_certification_ref = v_cleanup_ref
      limit 1;

      if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then
        return old;
      end if;
    end if;
  end if;

  raise exception 'phase14_provider_attestation_immutable';
end;
$$;

commit;
