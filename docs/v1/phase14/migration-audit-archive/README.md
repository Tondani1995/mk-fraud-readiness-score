# Phase 14 migration audit archive

These SQL files are inert audit artefacts outside `supabase/migrations`. The
`uat-applied` directory preserves the exact historical bytes applied to the
isolated UAT branch through `20260714214023`. The `unpublished-remediation`
directory preserves the reviewed fifth and sixth deltas used by the controlled
UAT reconciliation. Production contains the schema represented by archived
`0017`–`0019` under six timestamped records. Production has not received the
archived security-closure, fourth, fifth, sixth or sixth-handoff controls.

The deployable history is now the single atomic, disabled migration
`supabase/migrations/0017_phase14_canonical_disabled_foundation.sql`.

| Classification | File | Git blob | SHA-256 |
|---|---|---|---|
| UAT-applied | `0017_phase14_autonomous_report_engine.sql` | `be43066699b75f45c710ddd546a17ac8dfe8dd4b` | `49a11f3610df53f7ed14d08060d460e8263c276fdec9fdd8b3c48e97116ac206` |
| UAT-applied | `0018_phase14_pdf_email_delivery.sql` | `1d0f15aceb223d722be2933c7263ccfe2ef31947` | `14e7fdbb8d1d2c92a78923c649e73b4f5a5378e19073280864d143deac6dd3fe` |
| UAT-applied | `0019_phase14_email_delivery_state_hardening.sql` | `9bd006ed266f68b6171863375fae04b9315d6a7d` | `1779d8a700b4ce1e72fcb1611e6d864df4e41507cf9bce0ea1490ede59843a98` |
| UAT-applied | `0020_phase14_privileged_function_grants.sql` | `bdb778677086b17503e8cfc8dd88e23505474e5e` | `3beac7831756fd9c5d43573c5372ca6e096741f82712e985ffdefed85dc3b180` |
| UAT-applied | `0021_phase14_adversarial_remediation.sql` | `f10fb4918967e3fcbb34d1c64045e81e86fef603` | `4ebcdd55dd031f634afc04bbb0f30ede6070a6d3c6e9909c63b81467ac3628f3` |
| UAT-applied | `0022_phase14_adversarial_remediation_grants.sql` | `748e480e3764ce1f3893f31e5ae8538d7f996c2a` | `359e5ad5371a873dc5d36c6636bbf628e78173b0452674cf95afa481093e7981` |
| UAT-applied | `20260714194317_phase14_security_state_machine_closure.sql` | `19bcf877e2802600c0877aa2a8f65f85e375e75e` | `5037c698eb2acab09ee1c588c6b67909428b742600fa1cb7523272a71d7e1b93` |
| UAT-applied | `20260714201550_phase14_webhook_state_machine.sql` | `8a144cc187f8e33df90d5e5bbd88fe7890c06762` | `6b06ed1f6d5618ea3ad2f3b803fd8a19bc56466c62390f05499690dee82804b0` |
| UAT-applied | `20260714214023_phase14_fourth_adversarial_remediation.sql` | `421e4d4048f112032ef78d43603388537e9c3bea` | `0a9215cb5798e7695500dc88ceed2577dac4d60425beb43ce52d7ca4b0479f16` |
| Unpublished | `20260715022146_phase14_fifth_adversarial_remediation.sql` | `9f239133c47646daec17b56237d88ff970d7e2f2` | `a472e8d9a93052c8a51d2ec1cc2bc97a6b827a0b5fba97d3fdaa6f150ffab84b` |
| Unpublished | `20260715073613_phase14_sixth_adversarial_remediation.sql` | `3f4321b800c0524a947000eb4a583033fe4dcf2e` | `f9589a09d28590728f84978129209f4e748ea1e248218fea78e036c2a09bff18` |
| Unpublished | `20260715073614_phase14_sixth_handoff_corrections.sql` | pending commit | `d2ac47847dd764befae2772c18a44cd0e5427c034d5ac5d4d08717d3a1178d33` |

Canonical migration SHA-256: `37220215aa9fdfc6d5458e94ee708e0c816ef5d41a2ada97db9ffbbfef0256e1`.

The disposable fresh replay and simulated-UAT reconciliation both produce
canonical schema-inventory SHA-256
`5488895a97156f89e406491e782a65cd226e49fbe6293d4d964a31af2ead231a`.

The one-time script `scripts/phase14-uat-canonical-reconciliation.sql` first
locks and verifies the exact historical ledger/schema boundary, applies only
the archived fifth, sixth and sixth-handoff delta in one transaction, reconciles the ledger in
that same transaction, and validates final markers before commit. It is a
verified no-op after a successful commit, covering a lost client acknowledgement.
It must be controller-reviewed and run against UAT only in a separately
authorised round; it was not run against UAT here.
