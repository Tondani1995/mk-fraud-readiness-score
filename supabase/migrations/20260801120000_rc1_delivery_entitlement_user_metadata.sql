-- RC1: read the Storage checksum from where Supabase actually stores it.
--
-- Defect
-- ------
-- The RC1 certification journey generated a real PDF, verified it in private Storage, and was then
-- refused delivery with delivery_entitlement_failed. The cause is in
-- phase14_delivery_entitlement, which requires the stored object to carry a sha256 equal to the
-- report checksum:
--
--   coalesce(v_object.metadata->>'sha256', v_object.metadata->'metadata'->>'sha256', '')
--     <> v_report.checksum  ->  raise 'report_storage_metadata_mismatch'
--
-- Both of those read storage.objects.metadata, which Supabase populates with *system* metadata
-- only -- eTag, size, mimetype, cacheControl, lastModified, contentLength, httpStatusCode. The
-- checksum the uploader passes as `metadata: { sha256 }` is stored by Supabase Storage in the
-- separate storage.objects.user_metadata column.
--
-- Measured on the real object produced by this journey:
--
--   metadata      -> no sha256 key at all
--   user_metadata -> sha256 = e407e511...  matching reports.checksum exactly
--
-- So the uploader was always correct and the entitlement check was reading the wrong column. On
-- this Storage version the check could never pass, which means automatic premium delivery has
-- never been able to complete.
--
-- Correction
-- ----------
-- user_metadata is added to the object lookup and to the front of the existing coalesce chain.
-- The two historical locations are retained so an object written by an older Storage version
-- still satisfies the check.
--
-- The check is not weakened: a sha256 must still be present and must still equal the report's
-- recorded checksum, and every other entitlement condition -- product, price, currency, payment
-- verification, relationship, score-run currency, report status, storage metadata validity and
-- recipient identity -- is unchanged.

begin;

create or replace function public.phase14_delivery_entitlement(
  p_report_id uuid,
  p_recipient text,
  p_allow_test_override boolean default false,
  p_purpose text default 'email_delivery'::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype; v_order public.orders%rowtype; v_product public.products%rowtype;
  v_assessment public.assessments%rowtype; v_score_run public.score_runs%rowtype;
  v_customer_email text; v_current_report_id uuid; v_object record;
begin
  select * into v_report from public.reports where id = p_report_id for share;
  if not found then raise exception 'report_not_found'; end if;
  select * into v_order from public.orders where id = v_report.order_id for share;
  if not found then raise exception 'report_order_missing'; end if;
  select * into v_product from public.products where id = v_order.product_id for share;
  select * into v_assessment from public.assessments where id = v_report.assessment_id for share;
  select * into v_score_run from public.score_runs where id = v_report.score_run_id for share;
  select id into v_current_report_id from public.reports
  where assessment_id = v_report.assessment_id and report_type = v_report.report_type
    and status not in ('superseded','voided','draft')
  order by version_number desc limit 1;

  if v_report.report_type <> 'essential_self_assessment' or v_product.product_code <> 'essential_self_assessment' then raise exception 'delivery_report_type_ineligible'; end if;
  if v_order.amount_cents <> 500000 or v_product.price_cents <> 500000 then raise exception 'delivery_price_mismatch'; end if;
  if v_order.currency <> 'ZAR' or v_product.currency <> 'ZAR' then raise exception 'delivery_currency_mismatch'; end if;
  if v_order.status::text <> 'payment_received' then raise exception 'delivery_order_not_paid'; end if;
  if v_order.verified_at is null or v_order.verified_by is null then raise exception 'delivery_manual_verification_missing'; end if;
  if not v_product.active or not v_product.requires_payment_verification or v_product.delivery_mode <> 'mk_controlled_pdf' then raise exception 'delivery_product_policy_mismatch'; end if;
  if v_report.assessment_id <> v_order.assessment_id or v_score_run.assessment_id <> v_assessment.id then raise exception 'delivery_relationship_mismatch'; end if;
  if v_assessment.current_score_run_id <> v_score_run.id then raise exception 'delivery_stale_score_run'; end if;
  if v_score_run.status::text <> 'completed' or v_score_run.locked_at is null or v_score_run.input_hash !~ '^[0-9a-f]{64}$' then raise exception 'delivery_score_run_ineligible'; end if;
  if v_current_report_id is distinct from v_report.id or v_report.status in ('draft','superseded','voided') then raise exception 'delivery_report_not_current'; end if;
  if p_purpose = 'email_delivery' and v_report.status not in ('generated','approved','released') then raise exception 'delivery_report_status_forbidden'; end if;
  if p_purpose = 'admin_download' and v_report.status not in ('generated','under_review','approved','released') then raise exception 'download_report_status_forbidden'; end if;
  if coalesce(v_report.storage_bucket, '') = '' or coalesce(v_report.storage_path, '') = '' or v_report.checksum !~ '^[0-9a-f]{64}$' then raise exception 'delivery_storage_metadata_invalid'; end if;
  select bucket_id, name, metadata, user_metadata into v_object from storage.objects
  where bucket_id = v_report.storage_bucket and name = v_report.storage_path;
  if not found then raise exception 'report_storage_object_missing'; end if;
  if coalesce(v_object.metadata->>'mimetype', '') <> 'application/pdf'
     or coalesce(v_object.user_metadata->>'sha256', v_object.metadata->>'sha256', v_object.metadata->'metadata'->>'sha256', '') <> v_report.checksum then raise exception 'report_storage_metadata_mismatch'; end if;
  v_customer_email := lower(trim(v_order.customer_email::text));
  if not p_allow_test_override and lower(trim(p_recipient)) is distinct from v_customer_email then raise exception 'delivery_recipient_override_forbidden'; end if;
  return jsonb_build_object(
    'report_id', v_report.id, 'report_reference', v_report.report_reference,
    'report_status', v_report.status, 'report_checksum', v_report.checksum,
    'storage_bucket', v_report.storage_bucket, 'storage_path', v_report.storage_path,
    'order_id', v_order.id, 'assessment_id', v_assessment.id, 'score_run_id', v_score_run.id,
    'customer_email', v_customer_email, 'recipient', lower(trim(p_recipient)),
    'test_delivery', lower(trim(p_recipient)) is distinct from v_customer_email
  );
end;
$$;

commit;
