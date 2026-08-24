# V1.2 score-parity and split-gate fixtures

V1.1: MFRS-V1.1-ADAPTIVE-DRAFT-20260804 (fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab)
V1.2: MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821 (6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7)

These deterministic provider-free fixtures run the existing adaptive scoring engine against matched V1.1 and V1.2 gateway profiles. Retained and split controls receive the same domain fixture value; merged source items retain explicit traceability; NEW D3 controls receive the D3 fixture value. This isolates methodology/routing effects from arbitrary answer remapping.

Closure thresholds: absolute overall drift ≤3 points; absolute domain drift ≤5 points; no maturity-band change; no hard-gate cap or critical/major hard-gate-gap change. A failure is an owner-closure failure.

## Overall parity

| Profile | V1.1 overall | V1.2 overall | Drift | V1.1 band | V1.2 band | Applicable controls | Coverage | Critical gaps V1.1 → V1.2 | Major gaps V1.1 → V1.2 | Hard-gate caps | Reason |
|---|---:|---:|---:|---|---|---:|---:|---|---|---|---|
| low | 20 | 20 | 0 | Reactive | Reactive | 60 → 46 | 100% → 100% | 16 → 13 | 14 → 12 | any_core_domain_below_40:Developing, any_core_domain_below_60:Structured, any_hard_gate_critical_control_lte_1:Developing, three_or_more_critical_controls_lte_2:Developing | Gap-set changes are reported as approved scope/routing effects (critical D1-Q01,D1-Q04,D10-Q01,D2-Q01,D2-Q02,D3-Q01,D3-Q03,D3-Q04,D4-Q01,D4-Q03,D5-Q01,D5-Q05,D6-Q01,D7-Q01,D7-Q04,D8-Q04 → D1-Q01,D1-Q04,D10-Q01,D2-Q01,D2-Q02,D3-Q01,D3-Q04,D4-Q01,D4-Q03,D5-Q01,D5-Q05,D6-Q01,D8-Q04; major D1-Q01,D1-Q04,D10-Q01,D2-Q01,D2-Q02,D3-Q01,D3-Q03,D3-Q04,D4-Q01,D4-Q03,D5-Q01,D5-Q05,D7-Q04,D8-Q04 → D1-Q01,D1-Q04,D10-Q01,D2-Q01,D2-Q02,D3-Q01,D3-Q04,D4-Q01,D4-Q03,D5-Q01,D5-Q05,D8-Q04); hard-gate cap events are unchanged. Cap references unchanged. Domain availability changes are reported as approved factual-scope effects (D7: scored → not scored); numeric drift and overall drift remain within thresholds. Coverage unchanged. Retained, merged and split responses use the same deterministic domain fixtures; explicit weights preserve score comparability. |
| moderate | 60 | 60 | 0 | Structured | Structured | 68 → 68 | 100% → 100% | 0 → 0 | 0 → 0 | none | Critical and major hard-gate gap sets are unchanged. Cap references unchanged. Domain scored availability unchanged. Coverage unchanged. Retained, merged and split responses use the same deterministic domain fixtures; explicit weights preserve score comparability. |
| high | 80 | 80 | 0 | Strategic | Strategic | 68 → 68 | 100% → 100% | 0 → 0 | 0 → 0 | none | Critical and major hard-gate gap sets are unchanged. Cap references unchanged. Domain scored availability unchanged. Coverage unchanged. Retained, merged and split responses use the same deterministic domain fixtures; explicit weights preserve score comparability. |
| mixed | 57.8 | 57.8 | 0 | Developing | Developing | 67 → 68 | 100% → 100% | 8 → 8 | 1 → 1 | any_core_domain_below_40:Developing, any_core_domain_below_60:Structured, any_hard_gate_critical_control_eq_2:Structured, any_hard_gate_critical_control_lte_1:Developing, three_or_more_critical_controls_lte_2:Developing | Critical and major hard-gate gap sets are unchanged. Cap rule categories unchanged; related trigger references moved with the approved V1.2 control mapping (any_core_domain_below_40:00000000-0000-4000-8000-000000000007, any_core_domain_below_60:00000000-0000-4000-8000-000000000003, any_hard_gate_critical_control_eq_2:10000000-0000-4000-8000-000000000015, any_hard_gate_critical_control_lte_1:10000000-0000-4000-8000-000000000045, three_or_more_critical_controls_lte_2:none → any_core_domain_below_40:00000000-0000-4000-8000-000000000007, any_core_domain_below_60:00000000-0000-4000-8000-000000000003, any_hard_gate_critical_control_eq_2:10000000-0000-4000-8000-000000000008, any_hard_gate_critical_control_lte_1:10000000-0000-4000-8000-000000000052, three_or_more_critical_controls_lte_2:none). Domain scored availability unchanged. Coverage unchanged. Retained, merged and split responses use the same deterministic domain fixtures; explicit weights preserve score comparability. |
| provider-only | 53 | 53 | 0 | Developing | Developing | 68 → 66 | 100% → 100% | 7 → 7 | 0 → 0 | any_core_domain_below_60:Structured, any_hard_gate_critical_control_eq_2:Structured, three_or_more_critical_controls_lte_2:Developing | Critical and major hard-gate gap sets are unchanged. Cap rule categories unchanged; related trigger references moved with the approved V1.2 control mapping (any_core_domain_below_60:00000000-0000-4000-8000-000000000003, any_hard_gate_critical_control_eq_2:10000000-0000-4000-8000-000000000015, three_or_more_critical_controls_lte_2:none → any_core_domain_below_60:00000000-0000-4000-8000-000000000003, any_hard_gate_critical_control_eq_2:10000000-0000-4000-8000-000000000008, three_or_more_critical_controls_lte_2:none). Domain scored availability unchanged. Coverage unchanged. Provider-only replacements retain base weight; third-party digital oversight is used because no own/remote/payment environment is present. |
| low-exposure | 47.6 | 48.44 | 0.84 | Developing | Developing | 44 → 46 | 100% → 100% | 7 → 7 | 0 → 0 | any_core_domain_below_60:Structured, any_hard_gate_critical_control_eq_2:Structured, three_or_more_critical_controls_lte_2:Developing | Critical and major hard-gate gap sets are unchanged. Cap references unchanged. Domain availability changes are reported as approved factual-scope effects (D7: scored → not scored); numeric drift and overall drift remain within thresholds. Coverage unchanged. Retained, merged and split responses use the same deterministic domain fixtures; explicit weights preserve score comparability. |

## Domain score drift

| Profile | Domain drift (V1.2 − V1.1 points) |
|---|---|
| low | D1: +0.00; D2: +0.00; D3: +0.00; D4: +0.00; D5: +0.00; D6: +0.00; D7: 20.00 → not scored; D8: +0.00; D9: +0.00; D10: +0.00 |
| moderate | D1: +0.00; D2: +0.00; D3: +0.00; D4: +0.00; D5: +0.00; D6: +0.00; D7: +0.00; D8: +0.00; D9: +0.00; D10: +0.00 |
| high | D1: +0.00; D2: +0.00; D3: +0.00; D4: +0.00; D5: +0.00; D6: +0.00; D7: +0.00; D8: +0.00; D9: +0.00; D10: +0.00 |
| mixed | D1: +0.00; D2: +0.00; D3: +0.00; D4: +0.00; D5: +0.00; D6: +0.00; D7: +0.00; D8: +0.00; D9: +0.00; D10: +0.00 |
| provider-only | D1: +0.00; D2: +0.00; D3: +0.00; D4: +0.00; D5: +0.00; D6: +0.00; D7: +0.00; D8: +0.00; D9: +0.00; D10: +0.00 |
| low-exposure | D1: +0.00; D2: +0.00; D3: +0.00; D4: +0.00; D5: +0.00; D6: +0.00; D7: 40.00 → not scored; D8: +0.00; D9: +0.00; D10: +0.00 |

All six fixtures remain within the stated drift thresholds. No maturity-band changes or hard-gate cap-effect changes occurred. Critical/major gap-set deltas, where present, are reported above with their exact IDs and are attributable to approved factual scope/routing corrections.

## Explicit split-gate fixtures

| V1.1 source | V1.2 primary | V1.2 split | Source weight | Primary + split | Primary flags | Intended interpretation |
|---|---|---|---:|---:|---|---|
| D1-Q04 | D1-Q04 (1) | D1-Q07 (0.5) | 1.5 | 1.5 | critical / hard gate | Management ownership remains distinct from independent assurance. |
| D3-Q04 | D3-Q04 (1) | D3-Q08 (0.5) | 1.5 | 1.5 | critical / hard gate | Access provisioning remains distinct from periodic access recertification. |
| D8-Q04 | D8-Q04 (1) | D8-Q09 (0.5) | 1.5 | 1.5 | critical / hard gate | Sensitive-access restriction remains distinct from periodic sensitive-access review. |
| D8-Q08 | D8-Q08 (1) | D8-Q10 (0.5) | 1.5 | 1.5 | critical / hard gate | Identity-misuse detection remains distinct from investigation and containment. |

Each split fixture proves both controls are active on the high-exposure path, the original source weight is allocated exactly, the primary retains the original critical/hard-gate treatment, and the split introduces no new gate.
