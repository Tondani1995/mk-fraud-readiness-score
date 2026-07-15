-- Apply privileged Phase 14 remediation RPC grants as one parser-safe unit.

do $grants$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.assert_premium_report_generation_entitlement(text)',
    'public.claim_premium_report_generation(text,text,uuid,public.report_type)',
    'public.commit_premium_report_draft(uuid,uuid,text,text,text,uuid,uuid)',
    'public.publish_premium_report_generation(uuid,uuid,text)',
    'public.release_premium_report_generation_claim(uuid)',
    'public.assert_premium_report_delivery_entitlement(uuid,text,boolean)',
    'public.recover_stale_premium_report_email_sends()',
    'public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,jsonb)'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public, anon, authenticated';
    execute 'grant execute on function ' || v_signature || ' to service_role';
  end loop;
end;
$grants$;
