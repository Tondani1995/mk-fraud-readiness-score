# Release C — Domain Authentication (SPF/DKIM/DMARC)

Completes the launch gate named in `docs/safe-launch/15-email-and-secure-delivery-design.md`
("Domain-authentication requirements"): "SPF/DKIM/DMARC records and the exact sending domain are
not yet known to this document... recorded as a launch gate in the evidence pack, not resolved in
this design." This document resolves the *documentation* — actually configuring DNS requires the
MK owner's access to the domain's registrar/DNS provider, which this work does not have and could
not exercise even if it wanted to.

## Current status: nothing is configured

No SPF, DKIM, or DMARC record for any MK-controlled domain has been verified this cycle, or in
any prior cycle of this programme. This is a fact about the domain's DNS, not the codebase — it
cannot be discovered by reading source, and is not assumed either way in the absence of direct
confirmation from whoever controls that DNS.

## What the code assumes, and why it's still only an assumption

The sending address used throughout the codebase — the `MK_REPORT_EMAIL_FROM` env var's default,
and the hardcoded fallback in `src/lib/reports/email/report-delivery-service-core.ts:248` — is
`MK Fraud Insights <hello@mkfraud.co.za>`. This is a **plausible inference** (the `.env.example`
template that predates Release C used the same domain in its now-corrected `MK_FROM_EMAIL`
variable), not a confirmed fact. Before any real send:

1. Confirm with the MK owner that `mkfraud.co.za` (or whichever domain they intend to send from)
   is the domain they control and want to authenticate for this purpose.
2. Confirm the exact sending subdomain — many providers, including Resend, recommend sending from
   a dedicated subdomain (e.g. `mail.mkfraud.co.za` or `send.mkfraud.co.za`) rather than the bare
   apex domain, so a delivery reputation problem never affects the organisation's primary mail
   flow. This decision belongs to whoever controls the DNS, not to this codebase.

## What needs to be configured, once the domain is confirmed

All three records are configured at the DNS provider for the confirmed sending domain, using the
exact values Resend's own domain-verification flow provides once a domain is added there (a
Resend account itself is part of the still-open provider-resource decision gate — see
`docs/safe-launch/16-email-and-secure-delivery-runbook.md` and brief §17 — so the exact record
values cannot be produced by this document; they are generated per-domain by the provider at
setup time):

- **SPF (Sender Policy Framework)** — a TXT record on the sending domain authorising Resend's
  sending infrastructure. Must not conflict with any existing SPF record already in place for
  that domain (a domain can have only one SPF TXT record — a second one silently breaks SPF
  entirely, for every sender, not just this one). Check for an existing record before adding one.
- **DKIM (DomainKeys Identified Mail)** — typically one or more CNAME records Resend provides at
  domain-verification time, proving Resend is authorised to sign outgoing mail as this domain.
- **DMARC** — a TXT record (`_dmarc.<domain>`) declaring the policy for mail that fails SPF/DKIM.
  Recommend starting at `p=none` (monitor only, no delivery impact) for an initial observation
  period before tightening to `p=quarantine`/`p=reject` — this is a standard, conservative rollout
  practice, not specific to this codebase, and avoids a misconfiguration silently dropping the
  organisation's own legitimate mail.

## Verification, once configured

Resend's own dashboard reports per-record verification status after DNS propagation (can take up
to 48 hours depending on the provider and existing TTLs). Do not set `MK_EMAIL_PROVIDER_MODE` to
`live` until Resend reports the sending domain fully verified — sending through an unverified or
partially-authenticated domain risks the receiving mail server marking messages as spam or
rejecting them outright, which would be a worse outcome for the customer-facing report-ready email
than the current `disabled` state.

## Standing gate

Per every prior release cycle's instruction in this programme: do not create or configure any new
paid/metered external resource (including a Resend account, if one does not already exist funded)
without the MK owner's explicit approval each time — this is not a one-time approval covering all
of Release C's external-provider needs.

**Status: `NOT CONFIGURED`.** This is a hard prerequisite for `MK_EMAIL_PROVIDER_MODE=live`, not a
nice-to-have — it is independent of, and in addition to, the provider-account decision gate itself.
