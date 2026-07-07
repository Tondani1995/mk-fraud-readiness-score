# Route Map

## Public routes

- `/` - product landing shell.
- `/start` - accountless respondent start-assessment form.

## Respondent-token routes

- `/assessment/[assessmentRef]?token=...` - validates secure resume token and opens the matching draft assessment shell.
- `/snapshot/[assessmentRef]` - free snapshot shell after scoring in Phase 7.
- `/report/request/[assessmentRef]` - paid report request shell for Phase 9.

## Admin-authenticated routes

- `/admin/login` - MK admin login using Supabase Auth and `admin_profiles`.
- `/admin` - protected admin dashboard.
- `/admin/assessments` - protected assessment ownership view.
- `/admin/methodology` - protected methodology shell view.
- `/admin/orders` - protected future EFT verification shell.
- `/admin/reports` - protected future report control shell.
- `/admin/settings` - protected future platform settings shell.

## API routes

- `GET /api/health` - health check endpoint.
- `GET /api/system/build-info` - release metadata endpoint.
- `POST /api/admin/login` - validates Supabase Auth credentials and active MK admin profile, then sets HttpOnly admin cookies.
- `POST /api/admin/logout` - clears admin cookies.
- `GET /api/admin/me` - returns active admin session details.
- `POST /api/assessments/start` - server-side accountless assessment creation; creates organisation, respondent, assessment reference and hashed resume token.
- `POST /api/assessments/resume` - server-side resume-token validation endpoint.

## Contract note

Route names may be user-friendly, but internal status values used by route handlers must follow `docs/SCHEMA_CONTRACT.md` and `src/lib/types/domain.ts` exactly.


## Phase 5 routes

| Route | Purpose | Boundary |
|---|---|---|
| `/assessment/[assessmentRef]?token=...` | Loads the Phase 5 assessment engine after validating the resume token | Draft-only respondent access; no scoring |
| `/api/assessments/[assessmentRef]/answers` | Saves draft assessment answers and exposure answers | Validates token, draft status, N/A rules and exposure options |
| `/api/assessments/[assessmentRef]/submit` | Locks a completed assessment as submitted | Does not score or generate snapshot |

## Phase 6 route addition

| Route | Type | Purpose | Access |
|---|---|---|---|
| `POST /api/admin/assessments/[assessmentRef]/score` | API | Runs the deterministic Phase 6 scoring engine for a submitted assessment and stores the score trace. | Active MK admin only. Respondent tokens cannot access this route. |

No Free Snapshot UI is introduced in Phase 6. Snapshot display remains Phase 7.
