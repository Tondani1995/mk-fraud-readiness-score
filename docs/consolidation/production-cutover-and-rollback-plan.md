# Preview, cutover and rollback plan

This is an execution plan only. The consolidation change does not perform a production deploy, domain update, database migration, feature activation, webhook change, provider call, merge, deletion or repository rename.

## Protected Preview acceptance

1. Confirm the deployment belongs to Vercel project `prj_jFSTfwL14kk8UURjaaRwYe2HWuhK`, environment `Preview`, and the exact consolidation commit.
2. Confirm Vercel Authentication protects the Preview before sharing it.
3. Confirm root website pages, metadata, sitemap, robots and twelve published insight pages render.
4. Confirm `/fraud-readiness-score` embeds `/score/start?embed=1` from the same origin and every score CTA targets `/fraud-readiness-score#start-score`.
5. Confirm `/score/start`, respondent resume/save/submit/snapshot, product admin login and retained operational endpoints use `/score/*` without a global base path.
6. Confirm no request is rewritten, proxied or framed to the retired deployment hostnames.
7. Run the consolidation route smoke test against the protected Preview using authenticated browser access. Do not run respondent mutations against a shared Preview database unless separately approved.
8. Check deployment build/runtime logs for errors. Do not invoke email, AI, webhook, cleanup or report-provider flows.

## Pre-cutover hold point

The following require explicit approval in a later change window:

- Merge the draft pull request.
- Select the exact merged commit for production.
- Deploy that commit to Production in the existing Vercel project.
- Change the customer-facing domain assignment or DNS.
- Retire old Vercel projects or repository integrations.
- Apply any Supabase migration, including 0017.

Before approval, export read-only inventories of the existing Vercel project settings, environment-variable names by environment, domains, Git integration, deployment protection and function settings. Compare names and scopes only; never copy secret values into logs or GitHub.

## Production cutover sequence

Every step below is a future, separately approved production action:

1. Start a final source freeze across both repositories and both existing Vercel projects. Record the old website deployment ID, the consolidated project's current production deployment ID, both commit SHAs, domain assignments and DNS records.
2. Run a final website-content parity check against all twelve published insight slugs, root pages, metadata, sitemap, robots, legal copy, images and contact validation. Resolve differences before proceeding.
3. Confirm the draft PR's CI and protected Preview evidence are green for the exact merge candidate, then merge that approved commit into `main`.
4. Wait for the consolidated production deployment in Vercel project `prj_jFSTfwL14kk8UURjaaRwYe2HWuhK` to become `READY`. Do not touch domains while it is building.
5. Test the immutable Vercel production deployment URL before domain transfer: all root website routes, major article routes, `/fraud-readiness-score`, `/score/start?embed=1`, `/score/api/health`, static assets and the absence of cross-project proxying.
6. Remove `mkfraud.co.za` and `www.mkfraud.co.za` from the old website Vercel project only after step 5 passes and rollback ownership has been recorded.
7. Attach both `mkfraud.co.za` and `www.mkfraud.co.za` to the consolidated Vercel project and its approved production deployment.
8. Verify Vercel domain status, DNS resolution, TLS certificate issuance and the intended primary/redirect alias behavior for both hostnames.
9. Test every public root website route and representative published insight routes on the customer domain, including sitemap, robots, legal pages, images and contact client-side validation.
10. Test `/score/*` pages and read-only operational endpoints on the customer domain. Any respondent mutation requires the separately approved production smoke protocol.
11. Confirm the iframe on `/fraud-readiness-score#start-score` loads `/score/start?embed=1` from the same customer-domain origin and that no browser or server request targets an old deployment.
12. If any verification fails, immediately execute the rollback sequence below and restore both customer domains to the recorded old website deployment.
13. Delete the old website Vercel project only after the monitoring window is complete, stakeholders sign off, and the rollback-retention period has expired.
14. Rename the surviving Vercel project to `mk-fraud-platform` only after domain and deployment stability is confirmed.
15. Rename the surviving GitHub repository to `mk-fraud-platform` only after integrations, branch protection, Vercel Git linkage and documentation have been inventoried and an approved redirect plan exists.
16. Delete the old `fraud_website` GitHub repository only after the consolidated repository and production deployment are confirmed, its final SHA is archived, and every dependent automation has been migrated.

Steps 13–16 are deliberately after successful cutover and are not part of the domain-change window. At no point should this sequence alter Supabase, Phase 14 gates/policies, providers, webhooks or secret values.

## Rollback triggers

Rollback if any of these occur after cutover:

- Root website or `/score/*` routes return persistent 5xx responses.
- The readiness iframe is cross-origin, blank, blocked or points to a retired hostname.
- Product resume/save/submit behavior differs from the accepted Preview.
- Authentication protection or admin route boundaries regress.
- Sitemap, robots, legal pages or published insight content are materially unavailable.
- A new external proxy or unexpected provider invocation appears.

## Rollback sequence

1. Reassign the customer domain to the recorded previous production deployment in the same Vercel project, or use the approved Vercel rollback/promote mechanism for that deployment.
2. Verify root and product health on the restored deployment.
3. Leave Supabase unchanged. Because consolidation does not apply a database migration, database rollback is neither required nor authorised.
4. Leave old repositories, projects, deployments, aliases and Git integrations intact.
5. Capture deployment IDs, timestamps and observed errors in issue #22.
6. Reopen the consolidation PR or create a focused remediation PR; repeat protected Preview acceptance before another cutover attempt.

## Post-cutover follow-up (separate approval)

- Retire obsolete Vercel projects or aliases only after traffic and rollback retention requirements are met.
- Archive or rename repositories only after stakeholders confirm no automation, documentation or recovery process depends on them.
- Evaluate migration 0017 and any Phase 14 enablement in their own security-reviewed workstream. They are not prerequisites for this consolidation change.
