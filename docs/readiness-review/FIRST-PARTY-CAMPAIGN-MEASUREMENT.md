# First-party review campaign measurement

This release records the exact X / organic_social / fraud_readiness_100d / fr0001–fr2400 identity once for real reviews started with analytics consent. It does not infer historical attribution or load analytics on private review pages. The server accepts only enumerated content IDs. The database record is not a GA4 conversion.

Operator-only aggregate query (no personal details):
```sql
select c.acquisition_campaign_content as content_id,
       count(*) as attributed_starts,
       count(*) filter (where c.completed_at is not null) as completed_interviews
from readiness_review.session_contacts c
join readiness_review.sessions s on s.session_id=c.session_id
where not s.fictional and c.acquisition_campaign_content is not null
group by 1 order by 1;
```
Other campaigns, assessment-linked Advisory attribution, GA4 key events and historic raw IP retention/remediation require separate verified work. No source value is inferred from a customer's identity.
