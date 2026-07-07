# Phase 4 Exit Card

| Field | Entry |
|---|---|
| Phase | Phase 4 v1.1 - Admin Auth, Resume Tokens and Organisation Setup |
| Core deliverable | Working identity and ownership layer. |
| Output location | Phase 4 v1.1 repaired package. |
| Acceptance test | Run Phase 4 v1.1 smoke check, Supabase dev setup, admin login, accountless start, secure resume-link tests, and unauthenticated admin-before-query tests. |
| Result | Pending product-owner local/Supabase test. |
| Defects or risks | Requires Supabase dev project, environment variables and admin bootstrap before full runtime test. |
| Decision made | Respondents remain accountless; admin authentication uses Supabase Auth plus admin_profiles; resume tokens are hashed and validated server-side; admin pages must validate `requireAdmin()` before any service-role data query. |
| Parking-lot items added | Email dispatch, full assessment engine, scoring, payment, PDF generation. |
| Next smallest action | Product owner runs Supabase dev setup and local Phase 4 test plan. |
| Approval required before moving? | Yes. |
