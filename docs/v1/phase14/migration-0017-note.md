# Migration 0017 — Autonomous Report Engine

Migration `0017_phase14_autonomous_report_engine.sql` is additive and remains unapplied.

It creates private operational state for report fulfilments and generation provenance, links reports to successful runs, and inserts disabled Phase 14 feature flags.

Before application, controller review must confirm:

- table and index names do not conflict with production objects;
- authenticated users receive select access only through existing admin-role RLS helpers;
- service-role application writes remain possible;
- no respondent or anonymous access is introduced;
- foreign-key cycles are acceptable for the intended set-null/cascade behaviour;
- the active-fulfilment uniqueness rule matches retry and regeneration policy;
- Supabase security and performance advisors are rerun after application.

Applying the migration must not itself enable report automation, AI generation or customer email delivery.
