#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        print(f"already applied: {label}")
        return text
    raise SystemExit(f"missing patch anchor: {label}")


# 1) Scenario-state grounding: broaden only the two known synthesis sentences so the exact
# customer-visible wording produced in V8 is grounded to the recorded response labels.
adaptation_path = Path("src/lib/reports/essential-presentation-adaptation.ts")
adaptation = adaptation_path.read_text()
adaptation = replace_once(
    adaptation,
    r'/The current control weakness in the pathway is that monitoring and exception review are at an initial or ad hoc stage\./gi,',
    r'/The current (?:control )?weakness(?: linked to this pathway)? is that monitoring and exception review are at an initial or ad hoc stage\./gi,',
    "V8 monitoring scenario wording",
)
adaptation = replace_once(
    adaptation,
    r'/The current control weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage\./gi,',
    r'/The current (?:control )?weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage\./gi,',
    "V8 evidence/reporting scenario wording",
)
adaptation_path.write_text(adaptation)


# 2) Pagination: keep a roadmap stage heading attached to the first paragraph that explains it.
template_path = Path("src/lib/reports/templates/report-template.ts")
template = template_path.read_text()
css_anchor = "  .roadmap-table { break-inside: avoid; page-break-inside: avoid; }"
css_replacement = """  .roadmap-table { break-inside: avoid; page-break-inside: avoid; }
  /* V8.1 acceptance: do not strand a 60/90-day manuscript heading at the foot of a page. */
  .roadmap-stage-panel .manuscript-section > h3 { break-after: avoid; page-break-after: avoid; }
  .roadmap-stage-panel .manuscript-section > h3 + p { break-before: avoid; page-break-before: avoid; }"""
template = replace_once(template, css_anchor, css_replacement, "roadmap stage heading pagination")
template_path.write_text(template)


# 3) Exact customer-visible V8 regression fixtures plus legacy variants.
regression_path = Path("scripts/commercial-quality/essential-v7-final-acceptance-regression.mjs")
regression = regression_path.read_text()
regression = replace_once(
    regression,
    "  'The current control weakness in the pathway is that monitoring and exception review are at an initial or ad hoc stage. The activity may appear routine.',",
    "  'The current weakness linked to this pathway is that monitoring and exception review are at an initial or ad hoc stage. The activity may appear routine.',",
    "exact V8 monitoring fixture",
)
regression = replace_once(
    regression,
    "  'The current control weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage. A delayed report can weaken containment.',",
    "  'The current weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage. A delayed report can weaken containment.',",
    "exact V8 evidence/reporting fixture",
)
legacy_anchor = "assert.doesNotMatch(scenarioTwo, /evidence preservation, reporting and custody are at an initial or ad hoc stage/i);"
legacy_block = """assert.doesNotMatch(scenarioTwo, /evidence preservation, reporting and custody are at an initial or ad hoc stage/i);

const legacyScenarioOne = groundEssentialScenarioStateLanguage(
  'The current control weakness in the pathway is that monitoring and exception review are at an initial or ad hoc stage. The activity may appear routine.',
  findings
);
assert.match(legacyScenarioOne, /transaction and activity monitoring is self-assessed as \"Partially designed\"/i);

const legacyScenarioTwo = groundEssentialScenarioStateLanguage(
  'The current control weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage. A delayed report can weaken containment.',
  findings
);
assert.match(legacyScenarioTwo, /evidence preservation and custody are self-assessed as \"Initial \\/ ad hoc\"/i);
assert.match(legacyScenarioTwo, /confidential or anonymous reporting is self-assessed as \"Partially designed\"/i);"""
regression = replace_once(regression, legacy_anchor, legacy_block, "legacy scenario fixtures")
css_assert_anchor = "assert.match(template, /groundEssentialScenarioStateLanguage\\(value, evidenceModel\\.materialFindings\\)/);"
css_assert_block = """assert.match(template, /groundEssentialScenarioStateLanguage\\(value, evidenceModel\\.materialFindings\\)/);
assert.match(template, /\\.roadmap-stage-panel \\.manuscript-section > h3 \\{ break-after: avoid; page-break-after: avoid; \\}/);
assert.match(template, /\\.roadmap-stage-panel \\.manuscript-section > h3 \\+ p \\{ break-before: avoid; page-break-before: avoid; \\}/);"""
regression = replace_once(regression, css_assert_anchor, css_assert_block, "V8 roadmap orphan assertions")
if "v8ExactScenarioFixtures: 'PASS'" not in regression:
    regression = regression.replace("v7ScenarioStateGrounding: 'PASS',", "v7ScenarioStateGrounding: 'PASS',\n  v8ExactScenarioFixtures: 'PASS',")
if "v8RoadmapHeadingKeep: 'PASS'" not in regression:
    regression = regression.replace("v7SparsePageFlow: 'PASS'", "v7SparsePageFlow: 'PASS',\n  v8RoadmapHeadingKeep: 'PASS'")
regression_path.write_text(regression)

print("V8.1 deterministic final acceptance fixes applied")
