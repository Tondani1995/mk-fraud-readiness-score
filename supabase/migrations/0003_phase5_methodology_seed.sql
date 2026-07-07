-- MK Fraud Readiness Score V1 - Phase 5 methodology seed
-- Run after 0001_phase2_v1_1_schema_rls.sql and 0002_phase4_dev_seed.sql in the Supabase dev project.
-- Seeds the approved V1 methodology content needed by the assessment engine.
-- It does not create score runs or calculate scores.

begin;

insert into public.methodology_versions (version_code, title, status, effective_from)
values ('MFRS-V1.0', 'MK Fraud Readiness Score V1 Methodology', 'active', now())
on conflict (version_code) do update set
  title = excluded.title,
  status = excluded.status,
  effective_from = coalesce(public.methodology_versions.effective_from, excluded.effective_from),
  updated_at = now();

with mv as (select id from public.methodology_versions where version_code = 'MFRS-V1.0')
insert into public.response_scale (methodology_version_id, response_value, label, operational_meaning, normalised_score, display_order)
select mv.id, v.response_value, v.label, v.operational_meaning, v.normalised_score, v.display_order
from mv
cross join (values
  (0, 'Not in place', 'The control, process or capability does not exist or is not recognised as required.', 0.00, 1),
  (1, 'Initial / ad hoc', 'Some activity may occur informally or reactively, but it is not defined, owned or reliable.', 20.00, 2),
  (2, 'Partially designed', 'Some elements exist, but implementation is incomplete, inconsistent or not evidenced.', 40.00, 3),
  (3, 'Implemented', 'The capability is established in important areas, but may not operate consistently across the organisation.', 60.00, 4),
  (4, 'Consistently operating', 'The capability is formally implemented, evidenced and regularly operating.', 80.00, 5),
  (5, 'Embedded and improved', 'The capability is monitored, measured, governed and continuously improved.', 100.00, 6)
) as v(response_value, label, operational_meaning, normalised_score, display_order)
on conflict (methodology_version_id, response_value) do update set
  label = excluded.label,
  operational_meaning = excluded.operational_meaning,
  normalised_score = excluded.normalised_score,
  display_order = excluded.display_order;

with mv as (select id from public.methodology_versions where version_code = 'MFRS-V1.0')
insert into public.domains (methodology_version_id, domain_code, name, weight_pct, domain_type, is_core, sort_order)
select mv.id, v.domain_code, v.name, v.weight_pct, v.domain_type, v.is_core, v.sort_order
from mv
cross join (values
  ('D1', 'Fraud Leadership and Governance', 12.000, 'core', true, 1),
  ('D2', 'Fraud Risk Identification', 12.000, 'core', true, 2),
  ('D3', 'Operational Fraud Controls', 14.000, 'core', true, 3),
  ('D4', 'Fraud Detection Capability', 14.000, 'core', true, 4),
  ('D5', 'Fraud Incident Response', 10.000, 'core', true, 5),
  ('D6', 'Whistleblowing and Reporting Culture', 6.000, 'support', false, 6),
  ('D7', 'Third-Party and Supply Chain Fraud Risk', 10.000, 'core', true, 7),
  ('D8', 'Digital and Identity Fraud Risk', 12.000, 'core', true, 8),
  ('D9', 'Fraud Culture and Awareness', 5.000, 'support', false, 9),
  ('D10', 'Continuous Improvement and Fraud Risk Monitoring', 5.000, 'support', false, 10)
) as v(domain_code, name, weight_pct, domain_type, is_core, sort_order)
on conflict (methodology_version_id, domain_code) do update set
  name = excluded.name,
  weight_pct = excluded.weight_pct,
  domain_type = excluded.domain_type,
  is_core = excluded.is_core,
  sort_order = excluded.sort_order,
  updated_at = now();

with mv as (select id from public.methodology_versions where version_code = 'MFRS-V1.0'),
q as (
  select *
  from (values
  ('D1', 'D1-Q01', 'A senior executive or leadership function has clear accountability for fraud risk management.', 'Tests whether fraud risk has named leadership ownership.', 1.500, true, true, false, null, 'governance_owner_missing', 1),
  ('D1', 'D1-Q02', 'Fraud risk is formally recognised within the organisation’s enterprise risk management framework.', 'Tests whether fraud is integrated into the wider risk framework.', 1.250, false, false, false, null, 'erm_integration_gap', 2),
  ('D1', 'D1-Q03', 'Fraud risks and incidents are periodically reported to senior leadership or governance committees.', 'Tests leadership visibility and reporting rhythm.', 1.250, false, false, false, null, 'fraud_reporting_gap', 3),
  ('D1', 'D1-Q04', 'Responsibility for fraud risk management is clearly distinguished from internal audit’s independent assurance role.', 'Tests whether management ownership is confused with assurance.', 1.500, true, true, false, null, 'audit_ownership_confusion', 4),
  ('D1', 'D1-Q05', 'The organisation has defined policies or guidance that outline how fraud risks should be prevented, detected and managed.', 'Tests whether there is formal guidance for fraud risk management.', 1.000, false, false, false, null, 'policy_guidance_gap', 5),
  ('D1', 'D1-Q06', 'Leadership is informed about emerging fraud risks affecting the organisation’s sector or operating environment.', 'Tests whether leadership sees fraud as dynamic and external-facing.', 1.000, false, false, false, null, 'emerging_risk_visibility_gap', 6),
  ('D2', 'D2-Q01', 'The organisation has conducted a structured fraud risk assessment within the past two years.', 'Tests whether fraud risk has been deliberately assessed.', 1.500, true, true, false, null, 'fraud_risk_assessment_missing', 7),
  ('D2', 'D2-Q02', 'Fraud risks have been mapped across key operational processes such as procurement, payments, refunds, claims and supplier management.', 'Tests process-level fraud-risk visibility.', 1.500, true, true, false, null, 'process_risk_mapping_gap', 8),
  ('D2', 'D2-Q03', 'Fraud risks are considered when introducing new products, services or digital platforms.', 'Tests whether change introduces fraud review.', 1.250, false, false, false, null, 'change_fraud_review_gap', 9),
  ('D2', 'D2-Q04', 'The organisation periodically reviews fraud risks in response to operational changes or new market developments.', 'Tests whether fraud-risk identification is refreshed.', 1.000, false, false, false, null, 'risk_refresh_gap', 10),
  ('D2', 'D2-Q05', 'Fraud risks related to third-party relationships, suppliers or intermediaries have been assessed.', 'Tests third-party fraud-risk identification.', 1.250, false, false, true, 'profile_rule_d2_q05', 'third_party_risk_assessment_gap', 11),
  ('D2', 'D2-Q06', 'Emerging fraud threats affecting the organisation’s industry or sector are actively monitored.', 'Tests external fraud-threat monitoring.', 1.000, false, false, false, null, 'threat_monitoring_gap', 12),
  ('D2', 'D2-Q07', 'The organisation considers how fraud could occur through misuse of internal authority, system access or operational processes.', 'Tests insider and access-abuse risk thinking.', 1.250, false, false, false, null, 'insider_misuse_mapping_gap', 13),
  ('D2', 'D2-Q08', 'The organisation considers how fraud could occur through customer platforms, digital channels, loyalty programmes or service ecosystems.', 'Tests customer/digital ecosystem fraud visibility.', 1.000, false, false, true, 'profile_rule_d2_q08', 'digital_ecosystem_risk_gap', 14),
  ('D3', 'D3-Q01', 'High-risk processes such as procurement, payments or refunds include segregation of duties between initiation, approval and reconciliation.', 'Tests core preventive control design.', 1.500, true, true, false, null, 'segregation_of_duties_gap', 15),
  ('D3', 'D3-Q02', 'Transactions above defined financial thresholds require independent review or approval.', 'Tests threshold-based independent oversight.', 1.250, false, false, false, null, 'independent_approval_gap', 16),
  ('D3', 'D3-Q03', 'Supplier onboarding processes include background checks, verification of business information or due diligence.', 'Tests supplier legitimacy controls.', 1.500, true, true, false, null, 'supplier_due_diligence_gap', 17),
  ('D3', 'D3-Q04', 'System access rights are restricted based on job responsibilities and reviewed periodically.', 'Tests access control and periodic review.', 1.500, true, true, false, null, 'access_rights_review_gap', 18),
  ('D3', 'D3-Q05', 'Sensitive financial activities such as refunds, credits or manual adjustments are monitored or reviewed.', 'Tests monitoring of high-risk manual activities.', 1.250, false, false, true, 'profile_rule_d3_q05', 'sensitive_activity_monitoring_gap', 19),
  ('D3', 'D3-Q06', 'The organisation periodically reviews operational processes to identify control weaknesses or opportunities for manipulation.', 'Tests process-control review discipline.', 1.000, false, false, false, null, 'process_control_review_gap', 20),
  ('D3', 'D3-Q07', 'Individuals involved in high-risk activities are subject to oversight, rotation of duties or secondary review.', 'Tests people-layer oversight in sensitive roles.', 1.000, false, false, true, 'profile_rule_d3_q07', 'high_risk_role_oversight_gap', 21),
  ('D4', 'D4-Q01', 'The organisation monitors transactions or operational activities for unusual patterns or anomalies.', 'Tests active detection capability.', 1.500, true, true, false, null, 'anomaly_monitoring_gap', 22),
  ('D4', 'D4-Q02', 'Exception reports highlighting unusual transactions or activities are generated and reviewed regularly.', 'Tests exception-report generation and review.', 1.250, false, false, false, null, 'exception_reporting_gap', 23),
  ('D4', 'D4-Q03', 'Data analytics, monitoring reports or automated rules are used to identify unusual transactions, behavioural anomalies or control exceptions.', 'Tests analytics/rules-based detection maturity.', 1.500, true, true, false, null, 'fraud_analytics_gap', 24),
  ('D4', 'D4-Q04', 'Detection mechanisms are updated periodically to reflect new fraud risks or emerging threats.', 'Tests detection-refresh discipline.', 1.000, false, false, false, null, 'detection_refresh_gap', 25),
  ('D4', 'D4-Q05', 'Monitoring processes cover both internal fraud risks and external fraud threats.', 'Tests breadth of monitoring coverage.', 1.000, false, false, false, null, 'monitoring_coverage_gap', 26),
  ('D4', 'D4-Q06', 'Individuals responsible for monitoring suspicious activity have clear authority to escalate concerns.', 'Tests escalation authority.', 1.250, false, false, false, null, 'escalation_authority_gap', 27),
  ('D4', 'D4-Q07', 'Internal audit or risk functions periodically review detection mechanisms to assess their effectiveness.', 'Tests independent review of detection controls.', 1.000, false, false, false, null, 'detection_effectiveness_review_gap', 28),
  ('D5', 'D5-Q01', 'The organisation has a documented process for responding to suspected fraud incidents.', 'Tests existence of formal response framework.', 1.500, true, true, false, null, 'incident_response_missing', 29),
  ('D5', 'D5-Q02', 'Employees understand how and where to report suspected fraud or misconduct.', 'Tests practical reporting awareness.', 1.000, false, false, false, null, 'reporting_awareness_gap', 30),
  ('D5', 'D5-Q03', 'There are defined roles and responsibilities for managing fraud investigations.', 'Tests investigation ownership.', 1.250, false, false, false, null, 'investigation_role_gap', 31),
  ('D5', 'D5-Q04', 'Fraud investigations follow structured procedures that ensure fairness, confidentiality and proper documentation.', 'Tests procedural discipline in investigations.', 1.250, false, false, false, null, 'investigation_procedure_gap', 32),
  ('D5', 'D5-Q05', 'Evidence related to suspected fraud incidents is handled and preserved appropriately.', 'Tests evidence preservation capability.', 1.500, true, true, false, null, 'evidence_handling_gap', 33),
  ('D5', 'D5-Q06', 'The organisation considers engaging external specialists when incidents require forensic, legal or investigative expertise.', 'Tests escalation to specialist capability.', 1.000, false, false, false, null, 'specialist_escalation_gap', 34),
  ('D5', 'D5-Q07', 'Lessons learned from fraud incidents are used to improve controls and reduce future risk.', 'Tests post-incident learning.', 1.250, false, false, false, null, 'post_incident_learning_gap', 35),
  ('D6', 'D6-Q01', 'The organisation provides a confidential or anonymous channel for reporting suspected fraud or misconduct.', 'Tests reporting-channel availability.', 1.500, true, false, false, null, 'whistleblowing_channel_gap', 36),
  ('D6', 'D6-Q02', 'Employees are aware of how to report concerns through the whistleblowing channel.', 'Tests awareness of reporting channel.', 1.250, false, false, false, null, 'whistleblowing_awareness_gap', 37),
  ('D6', 'D6-Q03', 'Reports submitted through the whistleblowing channel are reviewed and investigated independently.', 'Tests independence of report handling.', 1.250, false, false, false, null, 'whistleblowing_independence_gap', 38),
  ('D6', 'D6-Q04', 'The organisation communicates that retaliation against whistleblowers is prohibited.', 'Tests protection message.', 1.000, false, false, false, null, 'retaliation_protection_gap', 39),
  ('D6', 'D6-Q05', 'Whistleblowing channels are accessible to external stakeholders such as suppliers, contractors or customers.', 'Tests external stakeholder accessibility.', 1.000, false, false, true, 'profile_rule_d6_q05', 'external_whistleblowing_gap', 40),
  ('D6', 'D6-Q06', 'Employees receive guidance or training on recognising and reporting suspicious behaviour.', 'Tests practical reporting and detection awareness.', 1.000, false, false, false, null, 'reporting_training_gap', 41),
  ('D7', 'D7-Q01', 'Suppliers, contractors or vendors are subject to background checks or due diligence before being engaged.', 'Tests third-party onboarding controls.', 1.500, true, false, false, null, 'third_party_due_diligence_gap', 42),
  ('D7', 'D7-Q02', 'Procurement processes include safeguards designed to reduce risks of collusion or manipulation.', 'Tests procurement integrity controls.', 1.250, false, false, false, null, 'procurement_collusion_gap', 43),
  ('D7', 'D7-Q03', 'The organisation requires employees to disclose conflicts of interest involving suppliers or third parties.', 'Tests conflict-of-interest control.', 1.250, false, false, false, null, 'conflict_of_interest_gap', 44),
  ('D7', 'D7-Q04', 'Supplier payment processes include verification mechanisms to reduce risks such as invoice manipulation or vendor impersonation.', 'Tests supplier payment verification.', 1.500, true, true, false, null, 'supplier_payment_verification_gap', 45),
  ('D7', 'D7-Q05', 'High-risk suppliers or third-party relationships are periodically reviewed or monitored.', 'Tests ongoing supplier monitoring.', 1.000, false, false, true, 'profile_rule_d7_q05', 'high_risk_supplier_monitoring_gap', 46),
  ('D7', 'D7-Q06', 'Procurement or vendor management activities are subject to oversight or periodic review.', 'Tests oversight over procurement/vendor management.', 1.000, false, false, false, null, 'procurement_oversight_gap', 47),
  ('D7', 'D7-Q07', 'The organisation considers fraud risks when entering partnerships, distribution arrangements or intermediary relationships.', 'Tests fraud review of partnerships/intermediaries.', 1.000, false, false, true, 'profile_rule_d7_q07', 'intermediary_fraud_review_gap', 48),
  ('D8', 'D8-Q01', 'The organisation has processes to verify the identity of customers, users or counterparties where appropriate.', 'Tests identity verification capability.', 1.500, true, true, true, 'profile_rule_d8_q01', 'identity_verification_gap', 49),
  ('D8', 'D8-Q02', 'Systems or platforms are monitored for suspicious behaviour such as unusual login activity or account access patterns.', 'Tests account/activity monitoring.', 1.500, true, true, true, 'profile_rule_d8_q02', 'suspicious_login_monitoring_gap', 50),
  ('D8', 'D8-Q03', 'Employees receive training on recognising phishing, social engineering and digital impersonation attempts.', 'Tests digital deception awareness.', 1.250, false, false, false, null, 'phishing_training_gap', 51),
  ('D8', 'D8-Q04', 'Access to sensitive systems is restricted and regularly reviewed.', 'Tests sensitive-system access governance.', 1.500, true, true, false, null, 'sensitive_system_access_gap', 52),
  ('D8', 'D8-Q05', 'The organisation monitors digital activity to detect potential misuse or unauthorised transactions.', 'Tests digital misuse detection.', 1.250, false, false, true, 'profile_rule_d8_q05', 'digital_activity_monitoring_gap', 53),
  ('D8', 'D8-Q06', 'Employees and users are encouraged to report suspicious digital activity or security concerns.', 'Tests digital reporting pathway.', 1.000, false, false, false, null, 'digital_reporting_gap', 54),
  ('D8', 'D8-Q07', 'The organisation periodically reviews emerging digital fraud risks relevant to its operations or sector.', 'Tests digital fraud threat refresh.', 1.000, false, false, false, null, 'digital_threat_review_gap', 55),
  ('D8', 'D8-Q08', 'The organisation has processes to detect identity misuse, account takeover or impersonation risks affecting customers or employees.', 'Tests identity-misuse and account-takeover detection.', 1.500, true, true, true, 'profile_rule_d8_q08', 'identity_misuse_detection_gap', 56),
  ('D9', 'D9-Q01', 'Employees receive periodic training or guidance on recognising fraud risks relevant to the organisation.', 'Tests periodic fraud awareness.', 1.250, false, false, false, null, 'fraud_training_gap', 57),
  ('D9', 'D9-Q02', 'Fraud awareness is included as part of employee onboarding or induction processes.', 'Tests onboarding awareness.', 1.000, false, false, false, null, 'onboarding_awareness_gap', 58),
  ('D9', 'D9-Q03', 'Leadership communicates clear expectations regarding ethical conduct and fraud prevention.', 'Tests leadership tone and ethics message.', 1.250, false, false, false, null, 'leadership_ethics_message_gap', 59),
  ('D9', 'D9-Q04', 'Employees understand the consequences of engaging in fraudulent or unethical behaviour.', 'Tests consequence awareness.', 1.000, false, false, false, null, 'consequence_awareness_gap', 60),
  ('D9', 'D9-Q05', 'The organisation communicates real examples or scenarios to help employees recognise fraud risks.', 'Tests scenario-based fraud awareness.', 1.000, false, false, false, null, 'scenario_awareness_gap', 61),
  ('D9', 'D9-Q06', 'Employees feel comfortable raising concerns about suspicious behaviour without fear of negative consequences.', 'Tests cultural safety and speak-up confidence.', 1.250, false, false, false, null, 'speak_up_culture_gap', 62),
  ('D10', 'D10-Q01', 'The organisation periodically reviews its fraud risks and control environment.', 'Tests continuous fraud-risk review.', 1.500, true, true, false, null, 'periodic_review_missing', 63),
  ('D10', 'D10-Q02', 'Fraud incidents or control failures are analysed to identify underlying causes.', 'Tests root-cause analysis.', 1.250, false, false, false, null, 'root_cause_analysis_gap', 64),
  ('D10', 'D10-Q03', 'Lessons learned from investigations or incidents are used to improve controls and processes.', 'Tests control-improvement discipline.', 1.250, false, false, false, null, 'lessons_to_controls_gap', 65),
  ('D10', 'D10-Q04', 'The organisation monitors fraud trends affecting its industry or operating environment.', 'Tests trend-monitoring discipline.', 1.000, false, false, false, null, 'trend_monitoring_gap', 66),
  ('D10', 'D10-Q05', 'Fraud risks are considered when implementing new systems, products or operational changes.', 'Tests change-control fraud lens.', 1.250, false, false, false, null, 'change_control_fraud_gap', 67),
  ('D10', 'D10-Q06', 'Leadership periodically evaluates whether existing fraud controls remain effective.', 'Tests executive control-effectiveness review.', 1.250, false, false, false, null, 'control_effectiveness_review_gap', 68)
  ) as v(domain_code, question_code, prompt, help_text, weight, is_critical, is_hard_gate, n_a_allowed, n_a_rule_key, trigger_key, sort_order)
)
insert into public.questions (
  methodology_version_id, domain_id, question_code, prompt, help_text, weight, is_critical, is_hard_gate,
  n_a_allowed, n_a_rule_key, trigger_key, sort_order, active
)
select mv.id, d.id, q.question_code, q.prompt, q.help_text, q.weight, q.is_critical, q.is_hard_gate,
  q.n_a_allowed, q.n_a_rule_key, q.trigger_key, q.sort_order, true
from mv
join q on true
join public.domains d on d.methodology_version_id = mv.id and d.domain_code = q.domain_code
on conflict (methodology_version_id, question_code) do update set
  domain_id = excluded.domain_id,
  prompt = excluded.prompt,
  help_text = excluded.help_text,
  weight = excluded.weight,
  is_critical = excluded.is_critical,
  is_hard_gate = excluded.is_hard_gate,
  n_a_allowed = excluded.n_a_allowed,
  n_a_rule_key = excluded.n_a_rule_key,
  trigger_key = excluded.trigger_key,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

with mv as (select id from public.methodology_versions where version_code = 'MFRS-V1.0'),
conditional_questions as (
  select id, n_a_rule_key from public.questions
  where methodology_version_id = (select id from mv)
    and n_a_allowed = true
    and n_a_rule_key is not null
)
insert into public.question_applicability_rules (question_id, rule_key, expression_json)
select id, n_a_rule_key, jsonb_build_object('phase','V1','rule','Profile-derived N/A only. Manual reason is required before submission, but the selected exposure profile must also make the question genuinely inapplicable.','rule_key',n_a_rule_key)
from conditional_questions
on conflict (question_id, rule_key) do update set expression_json = excluded.expression_json;

with mv as (select id from public.methodology_versions where version_code = 'MFRS-V1.0')
insert into public.exposure_factors (methodology_version_id, factor_code, name, max_points, input_type, options_json, sort_order)
select mv.id, v.factor_code, v.name, v.max_points, v.input_type, v.options_json, v.sort_order
from mv
cross join (values
  ('EXP-01', 'High-risk process footprint', 25.00, 'banded_select', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low", "points": 6.25}, {"value": "moderate", "label": "Moderate", "points": 12.5}, {"value": "high", "label": "High", "points": 18.75}, {"value": "severe", "label": "Severe", "points": 25.0}]}'::jsonb, 1),
  ('EXP-02', 'Third-party and supplier dependency', 15.00, 'banded_select', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low", "points": 3.75}, {"value": "moderate", "label": "Moderate", "points": 7.5}, {"value": "high", "label": "High", "points": 11.25}, {"value": "severe", "label": "Severe", "points": 15.0}]}'::jsonb, 2),
  ('EXP-03', 'Digital channel reliance', 15.00, 'banded_select', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low", "points": 3.75}, {"value": "moderate", "label": "Moderate", "points": 7.5}, {"value": "high", "label": "High", "points": 11.25}, {"value": "severe", "label": "Severe", "points": 15.0}]}'::jsonb, 3),
  ('EXP-04', 'Identity and personal-data dependency', 10.00, 'banded_select', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low", "points": 2.5}, {"value": "moderate", "label": "Moderate", "points": 5.0}, {"value": "high", "label": "High", "points": 7.5}, {"value": "severe", "label": "Severe", "points": 10.0}]}'::jsonb, 4),
  ('EXP-05', 'Cash, stock or high-value asset handling', 10.00, 'banded_select', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low", "points": 2.5}, {"value": "moderate", "label": "Moderate", "points": 5.0}, {"value": "high", "label": "High", "points": 7.5}, {"value": "severe", "label": "Severe", "points": 10.0}]}'::jsonb, 5),
  ('EXP-06', 'Operational dispersion', 8.00, 'banded_select', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low", "points": 2.0}, {"value": "moderate", "label": "Moderate", "points": 4.0}, {"value": "high", "label": "High", "points": 6.0}, {"value": "severe", "label": "Severe", "points": 8.0}]}'::jsonb, 6),
  ('EXP-07', 'Manual intervention and exception volume', 10.00, 'banded_select', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low", "points": 2.5}, {"value": "moderate", "label": "Moderate", "points": 5.0}, {"value": "high", "label": "High", "points": 7.5}, {"value": "severe", "label": "Severe", "points": 10.0}]}'::jsonb, 7),
  ('EXP-08', 'Public funds, regulated payments or vulnerable stakeholders', 7.00, 'banded_select', '{"options": [{"value": "none", "label": "None / not applicable", "points": 0}, {"value": "low", "label": "Low", "points": 1.75}, {"value": "moderate", "label": "Moderate", "points": 3.5}, {"value": "high", "label": "High", "points": 5.25}, {"value": "severe", "label": "Severe", "points": 7.0}]}'::jsonb, 8)
) as v(factor_code, name, max_points, input_type, options_json, sort_order)
on conflict (methodology_version_id, factor_code) do update set
  name = excluded.name,
  max_points = excluded.max_points,
  input_type = excluded.input_type,
  options_json = excluded.options_json,
  sort_order = excluded.sort_order;

with mv as (select id from public.methodology_versions where version_code = 'MFRS-V1.0')
insert into public.recommendation_rules (methodology_version_id, rule_code, trigger_type, condition_json, severity, title, body, sort_order, active)
select mv.id, v.rule_code, v.trigger_type, v.condition_json, v.severity, v.title, v.body, v.sort_order, true
from mv
cross join (values
  ('domain_score_39', 'phase1_trigger', '{"trigger": "Domain score <=39"}'::jsonb, 'Critical priority', 'Domain score <=39', 'Immediate MK review recommended; build basic ownership, controls and response foundations before relying on the score as mature.', 1),
  ('domain_score_40_59', 'phase1_trigger', '{"trigger": "Domain score 40-59"}'::jsonb, 'Improvement priority', 'Domain score 40-59', 'Formalise ownership, document controls, improve consistency and introduce review rhythm within 30-60 days.', 2),
  ('domain_score_60_79', 'phase1_trigger', '{"trigger": "Domain score 60-79"}'::jsonb, 'Strengthening priority', 'Domain score 60-79', 'Improve evidence, monitoring, escalation, analytics and cross-functional operating rhythm.', 3),
  ('domain_score_80', 'phase1_trigger', '{"trigger": "Domain score >=80"}'::jsonb, 'Maintain and improve', 'Domain score >=80', 'Protect the capability through periodic testing, control refresh and leadership reporting.', 4),
  ('any_hard_gate_critical_control_1', 'phase1_trigger', '{"trigger": "Any hard-gate critical control <=1"}'::jsonb, 'Maturity cap', 'Any hard-gate critical control <=1', 'Overall maturity cannot exceed Developing; include critical gap section in report.', 5),
  ('any_hard_gate_critical_control_2', 'phase1_trigger', '{"trigger": "Any hard-gate critical control =2"}'::jsonb, 'Maturity cap', 'Any hard-gate critical control =2', 'Overall maturity cannot exceed Structured; include remediation action in 30/60/90 plan.', 6),
  ('three_or_more_critical_controls_2', 'phase1_trigger', '{"trigger": "Three or more critical controls <=2"}'::jsonb, 'Maturity cap', 'Three or more critical controls <=2', 'Overall maturity cannot exceed Developing regardless of weighted score.', 7),
  ('assessment_coverage_80', 'phase1_trigger', '{"trigger": "Assessment coverage <80%"}'::jsonb, 'Invalid / incomplete', 'Assessment coverage <80%', 'Do not issue score; ask respondent to complete missing sections.', 8),
  ('assessment_coverage_80_89', 'phase1_trigger', '{"trigger": "Assessment coverage 80-89%"}'::jsonb, 'Provisional score', 'Assessment coverage 80-89%', 'Show coverage warning and recommend MK review before report release.', 9),
  ('n_a_rate_20', 'phase1_trigger', '{"trigger": "N/A rate >20%"}'::jsonb, 'Review flag', 'N/A rate >20%', 'Admin review required to ensure N/A selections are justified and not inflating the score.', 10)
) as v(rule_code, trigger_type, condition_json, severity, title, body, sort_order)
on conflict (methodology_version_id, rule_code) do update set
  trigger_type = excluded.trigger_type,
  condition_json = excluded.condition_json,
  severity = excluded.severity,
  title = excluded.title,
  body = excluded.body,
  sort_order = excluded.sort_order,
  active = true;

insert into public.app_settings (setting_key, value_json)
values
  ('phase5_methodology_seed', '{"version":"MFRS-V1.0","domains":10,"questions":68,"conditional_na_questions":11,"critical_controls":19,"hard_gate_controls":17,"exposure_factors":8,"scoring":"not_run_in_phase5"}'::jsonb)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;
