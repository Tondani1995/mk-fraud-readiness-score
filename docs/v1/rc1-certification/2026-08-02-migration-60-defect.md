# RC1 certification halt: migration 60 in-use check cannot admit a real journey

Date: 2026-08-02
Branch head at halt: d0e9d9f94570b6e37795ad84f46a43f8c560fc7e
Migration ledger: 60 / 20260801220000_rc1_synthetic_certification_marking
Certification reference intended: MKTEST-RC1-20260802-01

## What happened

The final certification journey was started from the verified zero baseline. Assessment
start succeeded and created the expected rows. The next step -- marking the organisation
synthetic through the audited migration-60 control -- cannot succeed, and never could.

## The defect

`public.rc1_mark_synthetic_certification_organisation(text,text,text)` refuses unless the
organisation has no score run, order, report, delivery authorisation, **email event**,
data request or access token. The intent was "nothing has happened under this organisation
yet, so it is provably a fresh certification journey and not a customer record".

`POST /score/api/assessments/start` creates, in the same operation:

  organisations 1, respondents 1, assessments 1, assessment_tokens 1,
  assessment_events 1, **email_events 1** (template `resume_link_phase4_placeholder`)

So an organisation that has just been created already has one email event. The in-use
check is therefore unsatisfiable for any real journey: the control can only ever mark an
organisation that does not exist yet.

Measured against the live journey, every other condition passes:

| condition                         | value |
|-----------------------------------|-------|
| unmarked                          | true  |
| created within the last hour      | true  |
| exactly one assessment            | true  |
| score_runs                        | 0     |
| orders                            | 0     |
| reports                           | 0     |
| report_delivery_authorizations    | 0     |
| data_requests                     | 0     |
| customer_report_access_tokens     | 0     |
| **email_events**                  | **1** |

Refusal that would be returned: `rc1_synthetic_marking:organisation_already_in_use`.

## Why the test suites did not catch it

Both suites seed their own fixtures directly rather than going through the start route,
and neither fixture creates the resume-link email event that the real route always
creates. K4 in the live suite proves a *used* organisation is refused by giving it an
order -- which is correct behaviour -- but no test asserts that a genuine freshly started
journey can still be marked. The gap is that nothing exercised the control against the
output of the real assessment-start path.

## The blocking row is not an external send

The four-message contract is intact. The resume-link event was not dispatched:

  template_key           resume_link_phase4_placeholder
  status                 queued
  provider_mode          disabled
  provider_message_id    null
  sent_at                null
  email_provider_events  0
  attestations           0

External sends during this window: 0.

## Containment performed

Per the standing instruction not to patch while the window is open:

1. Provider mode set to `disabled`.
2. Preview application mode set to `frozen` and redeployed.
3. Application proven to refuse: assessment start, synthetic cleanup, orphan remediation
   and certification enablement all return 423 RC1_OPERATION_FROZEN.
4. Database refreeze is pending: the AAL2 admin session expired and the control plane
   requires a fresh sign-in.

## Residue left in staging

  organisations 1, respondents 1, assessments 1, assessment_tokens 1,
  assessment_events 1, email_events 1
  answers 0, exposure answers 0, score runs 0, orders 0, reports 0,
  storage objects 0, provider events 0, attestations 0

Assessment reference: MKFRS-2026-556D146758

This residue cannot currently be removed by either audited control:

* the synthetic cleanup is scoped to a MKTEST-RC1 organisation, and the marker cannot be
  applied because of this defect;
* orphan remediation only removes provider rows that reference no business record, and
  every row here is linked.

Operational alerts remain at the pre-existing baseline of 2. No new alert was raised.

## Candidate correction (not applied)

Narrow the email-event arm of the in-use check so it counts only events that represent
real activity, rather than any row. The natural boundary is an event that has actually
been dispatched or bound to a provider:

    + (select count(*) from public.email_events e
         join public.assessments a on a.id = e.assessment_id
        where a.organisation_id = v_organisation_id
          and (e.provider_message_id is not null
               or e.sent_at is not null
               or e.status <> 'queued'))

with a regression test that drives the real `assessments/start` path and then asserts the
marking succeeds, so the fixture can never drift from the route again.

This is recorded as a candidate only. No code, migration or test has been changed.
