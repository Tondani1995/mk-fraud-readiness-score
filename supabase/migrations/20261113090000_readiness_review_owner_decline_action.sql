-- Build 1.6 records an accountable function declining a question as 'owner.decline'. The review store's action-type
-- check (20261111100000) predates build 1.6, so every decline failed to save on the database store and was reported to
-- the function as "Your answer could not be saved". Found in the B5 restricted end-to-end run on 13 November 2026.
-- Additive: the accepted types are the previous eleven plus 'owner.decline'.
alter table readiness_review.actions drop constraint actions_type_check;
alter table readiness_review.actions add constraint actions_type_check check (type in (
  'respondent.serve', 'respondent.answer', 'respondent.assignArea', 'respondent.correct', 'respondent.stop',
  'respondent.resume', 'owner.serve', 'owner.answer', 'owner.decline', 'organisation.sendToOwners', 'reviewer.evidence',
  'reviewer.review'
));
