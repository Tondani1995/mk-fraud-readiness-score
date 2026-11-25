-- First-party conversion measurement for the commissioned X campaign.
-- No third-party tracking on review pages, no role tokens or advertising click IDs.
alter table readiness_review.session_contacts
  add column if not exists acquisition_campaign_content text,
  add column if not exists acquisition_campaign_recorded_at timestamptz;
alter table readiness_review.session_contacts
  add constraint review_campaign_content_valid check (
    acquisition_campaign_content is null or
    acquisition_campaign_content ~ '^fr(000[1-9]|00[1-9][0-9]|0[1-9][0-9]{2}|1[0-9]{3}|2[0-3][0-9]{2}|2400)$'
  );
create function public.review_record_campaign_attribution(p_session_id text, p_content text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_content is null or p_content !~ '^fr(000[1-9]|00[1-9][0-9]|0[1-9][0-9]{2}|1[0-9]{3}|2[0-3][0-9]{2}|2400)$' then return false; end if;
  update readiness_review.session_contacts c
     set acquisition_campaign_content = p_content, acquisition_campaign_recorded_at = now()
    from readiness_review.sessions s
   where c.session_id = p_session_id and s.session_id = c.session_id
     and not s.fictional and c.acquisition_campaign_content is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end
$$;
revoke all on function public.review_record_campaign_attribution(text,text) from public, anon, authenticated;
grant execute on function public.review_record_campaign_attribution(text,text) to service_role;
comment on column readiness_review.session_contacts.acquisition_campaign_content is
  'First accepted consented public X organic_social fraud_readiness_100d content ID only; never a role link, ad click ID or respondent identifier. Completion joins to completed_at; subject to the same contact purge as the session.';
