-- MK Fraud Readiness Score V1 - versioned methodology copy polish
-- Purpose: create MFRS-V1.1 from MFRS-V1.0, apply respondent-facing copy polish to V1.1 only, and activate V1.1 for fresh assessments.
-- This preserves the MFRS-V1.0 audit trail for existing assessments and does not change scoring weights, flags, N/A rules, response scale scores, exposure max points or scoring logic.

begin;

-- 001 clone the active/used V1.0 methodology into a new V1.1 version if it does not already exist.
do $$
declare
  old_mv_id uuid;
  new_mv_id uuid;
begin
  select id into old_mv_id
  from public.methodology_versions
  where version_code = 'MFRS-V1.0';

  if old_mv_id is null then
    raise exception 'MFRS-V1.0 was not found.';
  end if;

  select id into new_mv_id
  from public.methodology_versions
  where version_code = 'MFRS-V1.1';

  if new_mv_id is null then
    insert into public.methodology_versions (version_code, title, status, effective_from, approved_at)
    select 'MFRS-V1.1', title || ' - Copy Polish', 'draft'::public.methodology_status, now(), now()
    from public.methodology_versions
    where id = old_mv_id
    returning id into new_mv_id;

    insert into public.response_scale (methodology_version_id, response_value, label, operational_meaning, normalised_score, display_order)
    select new_mv_id, response_value, label, operational_meaning, normalised_score, display_order
    from public.response_scale
    where methodology_version_id = old_mv_id;

    insert into public.domains (methodology_version_id, domain_code, name, weight_pct, domain_type, is_core, sort_order)
    select new_mv_id, domain_code, name, weight_pct, domain_type, is_core, sort_order
    from public.domains
    where methodology_version_id = old_mv_id;

    insert into public.questions (
      methodology_version_id, domain_id, question_code, prompt, help_text, weight,
      is_critical, is_hard_gate, n_a_allowed, n_a_rule_key, trigger_key, sort_order, active
    )
    select
      new_mv_id, nd.id, q.question_code, q.prompt, q.help_text, q.weight,
      q.is_critical, q.is_hard_gate, q.n_a_allowed, q.n_a_rule_key, q.trigger_key, q.sort_order, q.active
    from public.questions q
    join public.domains od on od.id = q.domain_id
    join public.domains nd on nd.methodology_version_id = new_mv_id and nd.domain_code = od.domain_code
    where q.methodology_version_id = old_mv_id;

    insert into public.question_applicability_rules (question_id, rule_key, expression_json)
    select nq.id, qar.rule_key, qar.expression_json
    from public.question_applicability_rules qar
    join public.questions oq on oq.id = qar.question_id
    join public.questions nq on nq.methodology_version_id = new_mv_id and nq.question_code = oq.question_code
    where oq.methodology_version_id = old_mv_id;

    insert into public.exposure_factors (methodology_version_id, factor_code, name, max_points, input_type, options_json, sort_order)
    select new_mv_id, factor_code, name, max_points, input_type, options_json, sort_order
    from public.exposure_factors
    where methodology_version_id = old_mv_id;

    insert into public.recommendation_rules (
      methodology_version_id, rule_code, trigger_type, condition_json, severity, title, body,
      action_30, action_60, action_90, sort_order, active
    )
    select
      new_mv_id, rule_code, trigger_type, condition_json, severity, title, body,
      action_30, action_60, action_90, sort_order, active
    from public.recommendation_rules
    where methodology_version_id = old_mv_id;

    insert into public.report_content_blocks (
      methodology_version_id, block_key, block_type, domain_code, maturity_band, severity, title, body,
      actions_json, status, version_number
    )
    select
      new_mv_id, block_key, block_type, domain_code, maturity_band, severity, title, body,
      actions_json, status, version_number
    from public.report_content_blocks
    where methodology_version_id = old_mv_id;
  end if;
end $$;

-- 002 apply copy polish to V1.1 only.
with mv as (
  select id from public.methodology_versions where version_code = 'MFRS-V1.1'
), copy_updates(question_code, prompt, help_text) as (
  values
    ('D1-Q01', $copy$A named senior owner is accountable for fraud risk management and has authority to drive action.$copy$, $copy$Looks at whether fraud risk has clear ownership at a level senior enough to make decisions, remove blockers and hold teams accountable.$copy$),
    ('D1-Q02', $copy$Fraud risk is recognised in the organisation's wider risk or governance framework.$copy$, $copy$Looks at whether fraud is treated as an organisational risk rather than only an incident, audit or investigation matter.$copy$),
    ('D1-Q03', $copy$Fraud risks, incidents and control weaknesses are reported to senior leadership or a governance forum on a defined rhythm.$copy$, $copy$Looks at whether leadership receives regular visibility of fraud exposure, incidents and unresolved control gaps.$copy$),
    ('D1-Q04', $copy$Management owns fraud risk, while internal audit or assurance functions provide independent review where they exist.$copy$, $copy$Looks at whether fraud ownership sits with management and is not confused with independent assurance or after-the-fact audit review.$copy$),
    ('D1-Q05', $copy$The organisation has written fraud guidance, policies or procedures explaining how fraud should be prevented, detected, reported and managed.$copy$, $copy$Looks at whether employees and managers have a clear reference point for fraud prevention, detection, reporting and response.$copy$),
    ('D1-Q06', $copy$Leadership receives updates on emerging fraud threats affecting the sector, operating model or customer and supplier environment.$copy$, $copy$Looks at whether fraud governance keeps pace with changing fraud methods, not only historical incidents.$copy$),
    ('D2-Q01', $copy$The organisation has completed a structured fraud risk assessment within the past two years.$copy$, $copy$Looks at whether fraud risks have been deliberately identified and assessed recently enough to remain useful.$copy$),
    ('D2-Q02', $copy$Fraud risks have been mapped across important processes such as procurement, payments, refunds, claims, stock, supplier management or service delivery.$copy$, $copy$Looks at whether the organisation understands where fraud could occur in the processes that matter most to its operating model.$copy$),
    ('D2-Q03', $copy$New systems, channels, products, services or operational changes include fraud-risk review before implementation.$copy$, $copy$Looks at whether fraud risk is considered before change goes live, rather than only after losses or incidents occur.$copy$),
    ('D2-Q04', $copy$Fraud risks are refreshed when the organisation changes how it operates, serves customers or works with suppliers.$copy$, $copy$Looks at whether the fraud-risk view is updated when the business model, process or external environment changes.$copy$),
    ('D2-Q05', $copy$Fraud risks linked to suppliers, contractors, agents, intermediaries or other third parties have been assessed.$copy$, $copy$Looks at whether third-party relationships are assessed for fraud exposure before they become a blind spot.$copy$),
    ('D2-Q06', $copy$The organisation monitors emerging fraud threats affecting its industry, geography or operating environment.$copy$, $copy$Looks at whether external fraud patterns are actively watched and considered in fraud-risk decisions.$copy$),
    ('D2-Q07', $copy$The organisation considers how fraud could occur through misuse of authority, privileged access, approvals, system permissions or operational process gaps.$copy$, $copy$Looks at whether insider misuse and access abuse are considered as practical fraud risks, not only external threats.$copy$),
    ('D2-Q08', $copy$The organisation considers how fraud could occur through customer or user platforms, online forms, WhatsApp journeys, loyalty programmes, service portals or other digital channels where relevant.$copy$, $copy$Looks at whether digital and customer-facing channels are included in fraud-risk identification, even outside financial services.$copy$),
    ('D3-Q01', $copy$High-risk processes have segregation of duties between initiation, approval, processing and reconciliation.$copy$, $copy$Looks at whether one person or team can complete a sensitive transaction without independent checks.$copy$),
    ('D3-Q02', $copy$Transactions or operational activities above defined risk or value thresholds require independent review or approval.$copy$, $copy$Looks at whether higher-risk actions receive proportionate oversight before they are completed.$copy$),
    ('D3-Q03', $copy$Supplier onboarding includes checks on business information, ownership, banking details or other fraud-risk indicators.$copy$, $copy$Looks at whether the organisation verifies suppliers before they are approved, paid or given access to work.$copy$),
    ('D3-Q04', $copy$System and data access are granted based on role requirements and reviewed periodically.$copy$, $copy$Looks at whether access remains appropriate as people change roles, leave teams or gain sensitive permissions.$copy$),
    ('D3-Q05', $copy$Sensitive manual activities such as refunds, credits, write-offs, stock adjustments, manual journals or overrides are monitored or reviewed.$copy$, $copy$Looks at whether manual exceptions and adjustments receive enough review to prevent quiet manipulation.$copy$),
    ('D3-Q06', $copy$Operational processes are periodically reviewed to identify control weaknesses or opportunities for manipulation.$copy$, $copy$Looks at whether processes are challenged before weaknesses are exploited.$copy$),
    ('D3-Q07', $copy$People in high-risk roles are subject to appropriate oversight, rotation, secondary review or other compensating controls.$copy$, $copy$Looks at whether sensitive roles are supervised in a way that reduces opportunity, pressure and unchecked authority.$copy$),
    ('D4-Q01', $copy$The organisation monitors transactions or operational activity for unusual patterns, anomalies or red flags.$copy$, $copy$Looks at whether fraud detection is active and ongoing rather than dependent only on complaints or chance discovery.$copy$),
    ('D4-Q02', $copy$Exception reports or alerts highlighting unusual transactions or activities are generated and reviewed regularly.$copy$, $copy$Looks at whether exceptions are not only produced, but actually reviewed by someone who can act.$copy$),
    ('D4-Q03', $copy$Analytics, rules, reports or data checks are used to identify suspicious transactions, behaviour or control exceptions.$copy$, $copy$Looks at whether available data is used to detect fraud patterns and not only to support routine reporting.$copy$),
    ('D4-Q04', $copy$Detection controls are updated when new fraud risks, fraud methods or operational changes emerge.$copy$, $copy$Looks at whether monitoring keeps pace with changing fraud patterns and business processes.$copy$),
    ('D4-Q05', $copy$Monitoring covers both internal misuse and external fraud threats where these are relevant to the organisation.$copy$, $copy$Looks at whether detection is broad enough to cover employee, supplier, customer and external threat activity where applicable.$copy$),
    ('D4-Q06', $copy$People responsible for monitoring suspicious activity know when to escalate concerns and have authority to do so.$copy$, $copy$Looks at whether alerts and concerns can move quickly from detection to action.$copy$),
    ('D4-Q07', $copy$Detection controls are periodically reviewed for effectiveness by management, risk, audit or another independent reviewer.$copy$, $copy$Looks at whether the organisation checks that detection still works, even where there is no formal internal audit function.$copy$),
    ('D5-Q01', $copy$The organisation has a documented process for responding to suspected fraud incidents.$copy$, $copy$Looks at whether there is a clear response path before an incident creates urgency, confusion or evidence loss.$copy$),
    ('D5-Q02', $copy$Employees know where and how to report suspected fraud or misconduct.$copy$, $copy$Looks at whether reporting channels are practical and understood by the people expected to use them.$copy$),
    ('D5-Q03', $copy$Roles and decision rights are defined for fraud triage, investigation, escalation and closure.$copy$, $copy$Looks at whether fraud incidents have clear ownership from the first report to final decision.$copy$),
    ('D5-Q04', $copy$Fraud investigations follow procedures that protect confidentiality, fairness, evidence and documentation.$copy$, $copy$Looks at whether investigations are handled consistently and defensibly rather than informally or inconsistently.$copy$),
    ('D5-Q05', $copy$Evidence linked to suspected fraud is identified, preserved and handled appropriately.$copy$, $copy$Looks at whether the organisation can protect documents, system records, communications and other evidence when fraud is suspected.$copy$),
    ('D5-Q06', $copy$External specialists are considered when incidents require forensic, legal, cyber or investigative expertise.$copy$, $copy$Looks at whether the organisation knows when a matter is beyond internal capacity and should be escalated to specialists.$copy$),
    ('D5-Q07', $copy$Lessons from fraud incidents are used to improve controls and reduce repeat exposure.$copy$, $copy$Looks at whether incidents lead to practical control improvement rather than only case closure.$copy$),
    ('D6-Q01', $copy$The organisation provides a confidential or anonymous channel for reporting suspected fraud or misconduct.$copy$, $copy$Looks at whether people have a safe way to raise concerns when direct reporting may not be appropriate.$copy$),
    ('D6-Q02', $copy$Employees know how to use the whistleblowing or confidential reporting channel.$copy$, $copy$Looks at whether the channel is understood in practice, not only documented in policy.$copy$),
    ('D6-Q03', $copy$Reports submitted through the channel are reviewed independently from the people or teams implicated.$copy$, $copy$Looks at whether reported concerns can be handled without conflicts of interest or interference.$copy$),
    ('D6-Q04', $copy$The organisation clearly communicates that retaliation against whistleblowers or people who raise concerns is prohibited.$copy$, $copy$Looks at whether people are protected and encouraged to report concerns in good faith.$copy$),
    ('D6-Q05', $copy$Reporting channels are accessible to relevant external stakeholders such as suppliers, contractors, customers or beneficiaries where appropriate.$copy$, $copy$Looks at whether people outside the organisation can raise concerns when they are exposed to fraud risk or misconduct.$copy$),
    ('D6-Q06', $copy$Employees receive guidance or training on recognising and reporting suspicious behaviour.$copy$, $copy$Looks at whether employees are equipped to notice fraud indicators and know what to do next.$copy$),
    ('D7-Q01', $copy$Suppliers, contractors or other third parties are subject to due diligence before being engaged.$copy$, $copy$Looks at whether third parties are checked before they create financial, operational or reputational exposure.$copy$),
    ('D7-Q02', $copy$Procurement processes include safeguards against collusion, manipulation, bid rigging or favouritism.$copy$, $copy$Looks at whether procurement decisions are protected from improper influence and hidden relationships.$copy$),
    ('D7-Q03', $copy$Employees are required to disclose and manage conflicts of interest involving suppliers or third parties.$copy$, $copy$Looks at whether personal, family or business interests are made visible before they distort decisions.$copy$),
    ('D7-Q04', $copy$Supplier payment processes include checks to reduce invoice manipulation, fake vendors, bank-detail changes or vendor impersonation.$copy$, $copy$Looks at whether supplier payments are protected before money leaves the organisation.$copy$),
    ('D7-Q05', $copy$High-risk suppliers or third-party relationships are periodically monitored or reviewed.$copy$, $copy$Looks at whether supplier risk is monitored after onboarding, not only at the start of the relationship.$copy$),
    ('D7-Q06', $copy$Procurement or vendor-management activity is subject to oversight or periodic review.$copy$, $copy$Looks at whether supplier-facing processes are reviewed for control weakness, manipulation and conflicts.$copy$),
    ('D7-Q07', $copy$Fraud risks are considered when using agents, brokers, distributors, intermediaries, partners or outsourced service providers where relevant.$copy$, $copy$Looks at whether indirect business models and partner channels are included in fraud-risk thinking.$copy$),
    ('D8-Q01', $copy$The organisation verifies the identity of customers, users, employees, suppliers or counterparties where identity misuse could create fraud loss or harm.$copy$, $copy$Looks at whether identity checks are proportionate to the risk, even where the organisation is not a financial institution.$copy$),
    ('D8-Q02', $copy$Systems or digital platforms are monitored for suspicious activity such as unusual login, access, profile, transaction or account behaviour.$copy$, $copy$Looks at whether digital activity is monitored for signs of misuse, compromise or account abuse.$copy$),
    ('D8-Q03', $copy$Employees receive training on phishing, social engineering and digital impersonation attempts.$copy$, $copy$Looks at whether employees can recognise digital deception before credentials, information or payments are compromised.$copy$),
    ('D8-Q04', $copy$Access to sensitive digital systems, administrator rights and confidential data is restricted and reviewed.$copy$, $copy$Looks at whether powerful digital permissions are controlled separately from routine system access.$copy$),
    ('D8-Q05', $copy$Digital activity is monitored for misuse, unauthorised transactions, suspicious data changes or channel abuse.$copy$, $copy$Looks at whether digital misuse can be detected before it becomes a larger incident or loss.$copy$),
    ('D8-Q06', $copy$Employees and users know how to report suspicious digital activity or account-security concerns.$copy$, $copy$Looks at whether digital concerns can be escalated quickly through a clear reporting path.$copy$),
    ('D8-Q07', $copy$Emerging digital fraud risks relevant to the organisation's operations or sector are reviewed periodically.$copy$, $copy$Looks at whether the organisation keeps digital fraud controls aligned to changing threats.$copy$),
    ('D8-Q08', $copy$The organisation can detect or investigate identity misuse, account takeover, impersonation or unauthorised profile changes where relevant.$copy$, $copy$Looks at whether identity-related fraud can be found and investigated when it affects customers, employees, suppliers or users.$copy$),
    ('D9-Q01', $copy$Employees receive periodic training or guidance on fraud risks relevant to their roles and the organisation's operating environment.$copy$, $copy$Looks at whether fraud awareness is practical, current and connected to the work people actually do.$copy$),
    ('D9-Q02', $copy$Fraud awareness is included in employee onboarding or induction.$copy$, $copy$Looks at whether fraud expectations are introduced early, before employees handle sensitive processes or decisions.$copy$),
    ('D9-Q03', $copy$Leadership communicates clear expectations on ethical conduct, conflicts of interest and fraud prevention.$copy$, $copy$Looks at whether leaders set the tone for fraud prevention and ethical decision-making.$copy$),
    ('D9-Q04', $copy$Employees understand the consequences of fraudulent, dishonest or unethical behaviour.$copy$, $copy$Looks at whether consequences are communicated clearly enough to support deterrence and accountability.$copy$),
    ('D9-Q05', $copy$The organisation uses real examples, scenarios or lessons learned to help employees recognise fraud risks.$copy$, $copy$Looks at whether awareness is made practical through cases, scenarios and relevant warning signs.$copy$),
    ('D9-Q06', $copy$Employees have safe ways to raise concerns and believe those concerns will be taken seriously.$copy$, $copy$Looks at whether the culture supports early reporting instead of silence, fear or informal workarounds.$copy$),
    ('D10-Q01', $copy$The organisation periodically reviews its fraud risks and control environment.$copy$, $copy$Looks at whether fraud readiness is refreshed regularly rather than treated as a once-off assessment.$copy$),
    ('D10-Q02', $copy$Fraud incidents or control failures are analysed to understand root causes and control weaknesses.$copy$, $copy$Looks at whether the organisation investigates why the failure happened, not only what happened.$copy$),
    ('D10-Q03', $copy$Lessons from investigations or incidents are translated into control, process, training or monitoring improvements.$copy$, $copy$Looks at whether learning leads to visible improvements that reduce future exposure.$copy$),
    ('D10-Q04', $copy$The organisation monitors fraud trends affecting its sector, geography, customer environment or supplier base.$copy$, $copy$Looks at whether the organisation learns from external patterns before they become internal incidents.$copy$),
    ('D10-Q05', $copy$Fraud risk is considered when new systems, products, services, processes or operational changes are implemented.$copy$, $copy$Looks at whether change management includes a fraud lens before controls are bypassed or weakened.$copy$),
    ('D10-Q06', $copy$Leadership periodically reviews whether key fraud controls remain effective, resourced and fit for purpose.$copy$, $copy$Looks at whether senior leaders challenge whether fraud controls still work in the current operating environment.$copy$)
)
update public.questions q
set prompt = copy_updates.prompt,
    help_text = copy_updates.help_text,
    updated_at = now()
from copy_updates, mv
where q.methodology_version_id = mv.id
  and q.question_code = copy_updates.question_code;

with mv as (
  select id from public.methodology_versions where version_code = 'MFRS-V1.1'
), exposure_updates(factor_code, name, options_json) as (
  values
    ('EXP-01', 'High-risk process footprint (procurement, refunds, claims, stock, payments or service delivery)', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low exposure", "points": 6.25}, {"value": "moderate", "label": "Moderate exposure", "points": 12.5}, {"value": "high", "label": "High exposure", "points": 18.75}, {"value": "severe", "label": "Severe exposure", "points": 25.0}]}'::jsonb),
    ('EXP-02', 'Third-party and supplier dependency (suppliers, contractors, agents or outsourced providers)', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low exposure", "points": 3.75}, {"value": "moderate", "label": "Moderate exposure", "points": 7.5}, {"value": "high", "label": "High exposure", "points": 11.25}, {"value": "severe", "label": "Severe exposure", "points": 15.0}]}'::jsonb),
    ('EXP-03', 'Digital channel reliance (portals, apps, online forms, WhatsApp journeys or customer platforms)', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low exposure", "points": 3.75}, {"value": "moderate", "label": "Moderate exposure", "points": 7.5}, {"value": "high", "label": "High exposure", "points": 11.25}, {"value": "severe", "label": "Severe exposure", "points": 15.0}]}'::jsonb),
    ('EXP-04', 'Identity and personal-data dependency (customers, employees, suppliers, beneficiaries or users)', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low exposure", "points": 2.5}, {"value": "moderate", "label": "Moderate exposure", "points": 5.0}, {"value": "high", "label": "High exposure", "points": 7.5}, {"value": "severe", "label": "Severe exposure", "points": 10.0}]}'::jsonb),
    ('EXP-05', 'Cash, stock or high-value asset handling', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low exposure", "points": 2.5}, {"value": "moderate", "label": "Moderate exposure", "points": 5.0}, {"value": "high", "label": "High exposure", "points": 7.5}, {"value": "severe", "label": "Severe exposure", "points": 10.0}]}'::jsonb),
    ('EXP-06', 'Operational dispersion (branches, depots, regions, sites, field teams or remote operations)', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low exposure", "points": 2.0}, {"value": "moderate", "label": "Moderate exposure", "points": 4.0}, {"value": "high", "label": "High exposure", "points": 6.0}, {"value": "severe", "label": "Severe exposure", "points": 8.0}]}'::jsonb),
    ('EXP-07', 'Manual intervention and exception volume (overrides, adjustments, manual approvals or exception handling)', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low exposure", "points": 2.5}, {"value": "moderate", "label": "Moderate exposure", "points": 5.0}, {"value": "high", "label": "High exposure", "points": 7.5}, {"value": "severe", "label": "Severe exposure", "points": 10.0}]}'::jsonb),
    ('EXP-08', 'Public funds, regulated payments or vulnerable stakeholders', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low exposure", "points": 1.75}, {"value": "moderate", "label": "Moderate exposure", "points": 3.5}, {"value": "high", "label": "High exposure", "points": 5.25}, {"value": "severe", "label": "Severe exposure", "points": 7.0}]}'::jsonb)
)
update public.exposure_factors ef
set name = exposure_updates.name,
    options_json = exposure_updates.options_json
from exposure_updates, mv
where ef.methodology_version_id = mv.id
  and ef.factor_code = exposure_updates.factor_code;

-- 003 activate V1.1 for fresh assessments. V1.0 content stays preserved for existing assessment audit history.
alter table public.methodology_versions disable trigger user;

update public.methodology_versions
set status = 'retired'::public.methodology_status,
    effective_to = coalesce(effective_to, now()),
    updated_at = now()
where version_code = 'MFRS-V1.0'
  and status = 'active'::public.methodology_status;

update public.methodology_versions
set status = 'active'::public.methodology_status,
    effective_from = coalesce(effective_from, now()),
    approved_at = coalesce(approved_at, now()),
    updated_at = now()
where version_code = 'MFRS-V1.1'
  and status <> 'active'::public.methodology_status;

alter table public.methodology_versions enable trigger user;

insert into public.app_settings (setting_key, value_json)
values (
  'active_methodology_copy_polish_v1_1',
  '{"active_version":"MFRS-V1.1","previous_version":"MFRS-V1.0","reason":"copy_polish_only","questions":68,"exposure_factors":8,"scope":"versioned_copy_only","scoring_structure_changed":false,"weights_changed":false,"critical_flags_changed":false,"hard_gate_flags_changed":false,"na_rules_changed":false}'::jsonb
)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;
