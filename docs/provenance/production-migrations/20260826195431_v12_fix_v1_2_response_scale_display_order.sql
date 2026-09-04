-- V1.2 response-scale data-contract correction.
--
-- The historical activation migration intentionally remains unchanged. It populated the
-- response_scale display_order from a zero-based JSON-array ordinal. The canonical contract is
-- one-based display_order (1..6), independently of response_value (0..5). This forward migration
-- corrects only that V1.2 data defect and leaves every scoring/input/content field untouched.
--
-- The owner-facing V1.2 candidate identifier is the graph version below. The corresponding
-- methodology_versions row is the exact owner-correction code registered by the historical
-- activation migration. Resolve through adaptive_graph_versions so this cannot target an
-- unrelated methodology row if either binding ever drifts.

begin;

do $$
declare
  v_graph_version constant text := 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821';
  v_methodology_version_code constant text := 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION';
  v_methodology_id uuid;
  v_graph_binding_count integer;
  v_methodology_binding_count integer;
  v_scale_row_count integer;
  v_distinct_response_value_count integer;
  v_distinct_display_order_count integer;
  v_matching_zero_based_order_count integer;
  v_trigger_count integer;
  v_user_trigger_count integer;
  v_response_values smallint[];
  v_display_orders integer[];
  v_labels text[];
  v_operational_meanings text[];
  v_normalised_scores numeric[];
  v_updated_count integer;
begin
  -- The owner-facing graph identifier must resolve to exactly one approved methodology binding.
  select count(*)::integer
  into v_graph_binding_count
  from public.adaptive_graph_versions ag
  join public.methodology_versions mv on mv.id = ag.methodology_version_id
  where ag.graph_version = v_graph_version
    and ag.methodology_version = v_methodology_version_code
    and mv.version_code = v_methodology_version_code;

  if v_graph_binding_count <> 1 then
    raise exception 'v12_response_scale_graph_methodology_binding_unexpected: %', v_graph_binding_count;
  end if;

  select count(*)::integer, (array_agg(mv.id))[1]
  into v_methodology_binding_count, v_methodology_id
  from public.methodology_versions mv
  join public.adaptive_graph_versions ag on ag.methodology_version_id = mv.id
  where ag.graph_version = v_graph_version
    and ag.methodology_version = v_methodology_version_code
    and mv.version_code = v_methodology_version_code;

  if v_methodology_binding_count <> 1 or v_methodology_id is null then
    raise exception 'v12_response_scale_methodology_row_unexpected: %', v_methodology_binding_count;
  end if;

  -- Fail closed unless the rows are exactly the historical malformed V1.2 shape. The content
  -- assertions protect labels, meanings and normalised scores from being silently rewritten by
  -- this data-contract-only correction.
  select
    count(*)::integer,
    count(distinct response_value)::integer,
    count(distinct display_order)::integer,
    count(*) filter (where display_order = response_value)::integer,
    array_agg(response_value order by response_value),
    array_agg(display_order order by response_value),
    array_agg(label order by response_value),
    array_agg(operational_meaning order by response_value),
    array_agg(normalised_score order by response_value)
  into
    v_scale_row_count,
    v_distinct_response_value_count,
    v_distinct_display_order_count,
    v_matching_zero_based_order_count,
    v_response_values,
    v_display_orders,
    v_labels,
    v_operational_meanings,
    v_normalised_scores
  from public.response_scale
  where methodology_version_id = v_methodology_id;

  if v_scale_row_count <> 6
    or v_distinct_response_value_count <> 6
    or v_distinct_display_order_count <> 6
    or v_matching_zero_based_order_count <> 6
    or v_response_values is distinct from array[0, 1, 2, 3, 4, 5]::smallint[]
    or v_display_orders is distinct from array[0, 1, 2, 3, 4, 5]::integer[]
    or v_labels is distinct from array[
      'Not in place',
      'Informal / reactive',
      'Partly designed',
      'Implemented in key areas',
      'Consistently operating',
      'Embedded and improving'
    ]::text[]
    or v_operational_meanings is distinct from array[
      'The capability is absent or is not recognised as required.',
      'Some activity occurs, but it is informal, reactive or dependent on individual effort.',
      'The capability has been partly designed, but important elements are incomplete or inconsistent.',
      'The capability operates in key areas, but coverage or consistency is not yet organisation-wide.',
      'The capability is defined, operating consistently and supported by evidence.',
      'The capability is measured, governed and deliberately improved over time.'
    ]::text[]
    or v_normalised_scores is distinct from array[0, 20, 40, 60, 80, 100]::numeric[] then
    raise exception 'v12_response_scale_source_shape_unexpected';
  end if;

  -- This is an already-used methodology, so its ordinary immutability trigger would correctly
  -- reject the owner-approved historical-data repair. Require the exact sole user trigger, disable
  -- it only inside this transaction, and restore it before the transaction can commit.
  select count(*)::integer
  into v_trigger_count
  from pg_trigger
  where tgrelid = 'public.response_scale'::regclass
    and not tgisinternal
    and tgname = 'trg_response_scale_immutability'
    and tgenabled = 'O';

  select count(*)::integer
  into v_user_trigger_count
  from pg_trigger
  where tgrelid = 'public.response_scale'::regclass
    and not tgisinternal;

  if v_trigger_count <> 1 or v_user_trigger_count <> 1 then
    raise exception 'v12_response_scale_immutability_trigger_unexpected: named_enabled=% total_user=%',
      v_trigger_count, v_user_trigger_count;
  end if;

  alter table public.response_scale disable trigger trg_response_scale_immutability;

  update public.response_scale
  set display_order = response_value + 1
  where methodology_version_id = v_methodology_id
    and display_order = response_value;

  get diagnostics v_updated_count = row_count;

  alter table public.response_scale enable trigger trg_response_scale_immutability;

  if v_updated_count <> 6 then
    raise exception 'v12_response_scale_update_count_unexpected: %', v_updated_count;
  end if;

  -- Postcondition: only display_order changed, and the validator's canonical 0..5/1..6 contract
  -- is now represented by the final database rows.
  select
    count(*)::integer,
    count(distinct response_value)::integer,
    count(distinct display_order)::integer,
    array_agg(response_value order by response_value),
    array_agg(display_order order by response_value),
    array_agg(label order by response_value),
    array_agg(operational_meaning order by response_value),
    array_agg(normalised_score order by response_value)
  into
    v_scale_row_count,
    v_distinct_response_value_count,
    v_distinct_display_order_count,
    v_response_values,
    v_display_orders,
    v_labels,
    v_operational_meanings,
    v_normalised_scores
  from public.response_scale
  where methodology_version_id = v_methodology_id;

  if v_scale_row_count <> 6
    or v_distinct_response_value_count <> 6
    or v_distinct_display_order_count <> 6
    or v_response_values is distinct from array[0, 1, 2, 3, 4, 5]::smallint[]
    or v_display_orders is distinct from array[1, 2, 3, 4, 5, 6]::integer[]
    or v_labels is distinct from array[
      'Not in place',
      'Informal / reactive',
      'Partly designed',
      'Implemented in key areas',
      'Consistently operating',
      'Embedded and improving'
    ]::text[]
    or v_operational_meanings is distinct from array[
      'The capability is absent or is not recognised as required.',
      'Some activity occurs, but it is informal, reactive or dependent on individual effort.',
      'The capability has been partly designed, but important elements are incomplete or inconsistent.',
      'The capability operates in key areas, but coverage or consistency is not yet organisation-wide.',
      'The capability is defined, operating consistently and supported by evidence.',
      'The capability is measured, governed and deliberately improved over time.'
    ]::text[]
    or v_normalised_scores is distinct from array[0, 20, 40, 60, 80, 100]::numeric[] then
    raise exception 'v12_response_scale_postcondition_failed';
  end if;

  select count(*)::integer
  into v_trigger_count
  from pg_trigger
  where tgrelid = 'public.response_scale'::regclass
    and not tgisinternal
    and tgname = 'trg_response_scale_immutability'
    and tgenabled = 'O';

  if v_trigger_count <> 1 then
    raise exception 'v12_response_scale_immutability_trigger_not_restored';
  end if;
end;
$$;

commit;
