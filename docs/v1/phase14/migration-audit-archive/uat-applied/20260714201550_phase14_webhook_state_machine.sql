do $webhook_grants$
begin
  execute 'revoke execute on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb) to service_role';
end;
$webhook_grants$;
