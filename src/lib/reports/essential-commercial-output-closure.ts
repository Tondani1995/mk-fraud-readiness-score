/**
 * Deterministic pre-validation normalisation for the Essential customer artefact.
 *
 * This module may only perform closed-set, meaning-preserving presentation repairs. The result MUST
 * pass the canonical Essential validation cascade before it is rendered to PDF. Nothing is allowed
 * to mutate customer-facing HTML after final acceptance.
 */

function textOnly(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lowerFirst(value: string): string {
  return value.length ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

/**
 * Customer-facing proof purpose by evidence-artefact family.
 *
 * The old generic fallback joined an artefact title to a questionnaire prompt and produced prose
 * such as "provides operating evidence that ... is implemented". These descriptions are deliberately
 * artefact-led: the customer should be able to see what each requested item proves without reading
 * an internal question or methodology identifier.
 */
export function essentialEvidenceProofPurpose(artefact: string): string {
  const name = textOnly(artefact).normalize('NFKC').trim();
  const rules: Array<[RegExp, string]> = [
    [/approved fraud[- ]risk RACI/i, 'Whether fraud-risk ownership, decision rights, escalation authority and the separation of control operation from independent review are formally assigned and approved.'],
    [/governing body.*minutes.*independent reporting/i, 'Whether fraud-risk matters and independent assurance are reported through the approved governance route with decisions and escalation recorded.'],
    [/internal audit charter|assurance mandate/i, 'Whether the independent assurance function has a formally approved mandate, unrestricted reporting route and responsibilities separate from management control ownership.'],
    [/control linkage.*preventive.*detective/i, 'Whether each mapped fraud scenario is linked to named preventive and detective controls, with residual gaps identifiable.'],
    [/per[- ]process fraud scenario map/i, 'Whether each material process has explicit fraud scenarios, relevant roles or permissions and residual exposure documented.'],
    [/process inventory.*material value[- ]bearing/i, 'Whether the complete population of material value-bearing processes has been identified before fraud-risk mapping is assessed.'],
    [/process[- ]owner sign[- ]off/i, 'Whether process owners have reviewed and accepted the mapped fraud scenarios, control ownership and residual gaps.'],
    [/beneficial[- ]ownership.*conflict/i, 'Whether proposed suppliers are screened for ownership and conflict indicators before activation and any exceptions are resolved or approved.'],
    [/completed onboarding checklist/i, 'Whether the required supplier due-diligence checks were completed before activation for the in-scope supplier population.'],
    [/independent registration.*bank verification/i, 'Whether supplier legal identity and bank-account ownership were independently verified before activation or payment.'],
    [/second[- ]reviewer approval/i, 'Whether supplier activation or another high-risk change received the required independent second-person approval before release.'],
    [/approval and business justification/i, 'Whether every privileged-access assignment in scope has an approved business justification, a named accountable owner and a documented basis for the level of access granted.'],
    [/privileged[- ]account register/i, 'Whether the complete privileged-account population is recorded with account type, system, owner, privilege level, status and review date so that unknown or unjustified access can be identified.'],
    [/privileged[- ]session.*access logs|privileged session.*access logs/i, 'Whether privileged activity is attributable to named accounts and reviewable for unusual, unauthorised or out-of-pattern activity during the stated period.'],
    [/quarterly independent recertification/i, 'Whether the complete privileged-access population was independently reviewed on schedule, with explicit keep-or-remove decisions and unresolved exceptions identified.'],
    [/removal tickets/i, 'Whether access removals identified through recertification, role change or leaver events were completed within the required service level and are traceable to closure evidence.'],
    [/bank[- ]detail[- ]change request/i, 'Whether each bank-detail change is uniquely recorded, attributable and linked to the verification and approval trail before payment release.'],
    [/^independent approval$/i, 'Whether the high-risk change or transaction received approval from the required independent role before release.'],
    [/monthly .*exception report/i, 'Whether control exceptions, failures and bypass attempts are consolidated, reviewed by the accountable owner and followed through to resolution.'],
    [/payment hold.*release audit trail/i, 'Whether payment was held while verification was incomplete and released only after the required checks and approvals were completed.'],
    [/pre-existing contact record.*callback log/i, 'Whether bank-detail or payment-instruction changes were independently confirmed through trusted contact details that pre-dated the requested change.'],
    [/chain[- ]of[- ]custody/i, 'Whether every transfer of material evidence records custody, timing and handover without unexplained gaps.'],
    [/evidence register/i, 'Whether all material evidence items are uniquely recorded, assigned and traceable through the case.'],
    [/hash or seal/i, 'Whether collected evidence has integrity markers that can be matched at later custody points.'],
    [/repository access log/i, 'Whether access to preserved evidence is restricted, attributable and reviewable.'],
    [/retention.*legal[- ]hold/i, 'Whether preservation instructions define the required retention or legal-hold treatment for relevant records.'],
    [/monitoring[- ]rule catalogue|rule catalogue/i, 'Whether monitoring rules are defined, linked to fraud scenarios, assigned to a reviewing role and maintained through controlled tuning.'],
    [/monitoring output/i, 'Whether the defined monitoring cycle actually ran for the stated period and produced reviewable exceptions.'],
    [/population reconciliation/i, 'Whether the monitored population reconciles to the complete source-system population for the stated period.'],
    [/monthly tuning.*coverage report|tuning and coverage report/i, 'Whether priority event feeds were monitored for the stated period, high-risk alerts were triaged to the required service level, coverage gaps were recorded and rule tuning was completed from confirmed outcomes.'],
    [/coverage report/i, 'Whether monitoring coverage includes the material processes or events in scope and makes any coverage gap visible.'],
    [/red[- ]flag indicator definitions/i, 'Whether monitoring criteria are documented for the material processes and aligned to the fraud scenarios management intends to detect.'],
    [/alert case records/i, 'Whether alerts are assigned, investigated, dispositioned and escalated within the defined review standard.'],
    [/in[- ]scope event inventory/i, 'Whether the complete population of priority login, access, profile and transaction events has been identified for monitoring.'],
    [/verification risk points/i, 'Whether the organisation has explicitly defined where identity verification is required before onboarding, activation or sensitive change.'],
    [/re[- ]verification records/i, 'Whether sensitive identity, profile or banking changes trigger and retain the required re-verification evidence.'],
    [/exception approvals/i, 'Whether verification exceptions are documented, approved by the authorised role and traceable to the affected case or transaction.'],
    [/fraud risk assessment report/i, 'Whether a current structured fraud risk assessment covers the material processes, scenarios, ratings, owners and treatment decisions.'],
    [/treatment plan/i, 'Whether unacceptable fraud risks have approved treatments, accountable owners and in-date delivery commitments.'],
    [/review scope and schedule/i, 'Whether fraud-risk and control-effectiveness review has a defined scope, frequency, ownership and governance route.'],
    [/lapsed or degraded control register/i, 'Whether controls found to have lapsed or degraded are recorded, assigned for remediation and tracked to closure.']
  ];
  const match = rules.find(([pattern]) => pattern.test(name));
  if (match) return match[1];
  return `Whether sufficient, attributable evidence is present in the ${lowerFirst(name)} to test the linked control across the complete in-scope population for the stated period.`;
}

function replaceEvidenceProofRows(html: string): string {
  return html.replace(/<tr>[\s\S]*?<\/tr>/gi, (row) => {
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/gi)];
    if (cells.length < 3) return row;
    const currentProof = textOnly(cells[2]![1] ?? '');
    if (!/provides operating evidence that|This evidence should demonstrate that the linked control requirements|demonstrates that the linked control was operated and evidenced|Whether sufficient, attributable evidence is present in/i.test(currentProof)) return row;
    const artefact = textOnly(cells[1]![1] ?? '');
    const purpose = essentialEvidenceProofPurpose(artefact);
    const oldCell = `<td>${cells[2]![1]}</td>`;
    return row.replace(oldCell, `<td>${purpose}</td>`);
  });
}

function replaceRecommendedNextStep(html: string): string {
  return html.replace(
    /(<p class="recommended-next-step"><strong>Recommended next step\.<\/strong>\s+Commission independent validation of the )([^.<]+)(\.\s+)Confirm [\s\S]*?(?=\s+This is the immediate proof priority;)/gi,
    (_whole, prefix: string, artefact: string) => {
      const purpose = essentialEvidenceProofPurpose(artefact).replace(/[.]$/, '');
      return `${prefix}${artefact}. Confirm ${lowerFirst(purpose)}.`;
    }
  );
}

function replaceThirtyDayDecisionCompletionTests(html: string): string {
  const oldCompletion = '<td>Decision recorded, accountable owner confirmed and escalation route documented.</td>';
  const replacements: Array<[string, string]> = [
    [
      'Approve accountable executive mandates and escalation authority for priority remediation.',
      '<td>Signed mandate names each accountable executive, decision rights and the escalation route.</td>'
    ],
    [
      'Approve the target control standards management will implement across the priority risk areas.',
      '<td>Approved control-improvement baseline records the required design standard and any authorised deviations.</td>'
    ],
    [
      'Approve prerequisite-first sequencing for dependent improvements.',
      '<td>Dependency sequence is approved with named prerequisite owners and escalation for threatened dependencies.</td>'
    ]
  ];

  return html.replace(/<tr>[\s\S]*?<\/tr>/gi, (row) => {
    if (!row.includes(oldCompletion)) return row;
    const rowText = textOnly(row);
    const replacement = replacements.find(([decision]) => rowText.includes(decision));
    return replacement ? row.replace(oldCompletion, replacement[1]) : row;
  });
}

export function closeEssentialCommercialOutputDefects(html: string): string {
  let closed = html;

  closed = closed
    .replace(/Evidence mapped to G28-?D\d+-Q\d+/gi, 'Evidence mapped to the named risk and value population')
    .replace(/Evidence mapped to G28-?/gi, 'Evidence mapped to the named risk and value population')
    .replace(/populationD\d+-Q\d+/gi, 'population')
    .replace(/\bD\d+-Q\d+\b/g, '');

  closed = closed
    .replace(
      'This assessment records an absence of foundational fraud controls across ',
      'This assessment records foundational fraud controls at Partially designed or below across '
    )
    .replaceAll('Recorded absent', 'Partially designed or below')
    .replaceAll(
      'Each step names the exact control recorded as absent.',
      'Each step names the exact control requiring establishment or strengthening.'
    );

  closed = closed.replace(
    /The (\d+) conditions selected for executive attention from (\d+) recorded findings\./g,
    '$1 conditions were selected for executive attention from $2 recorded findings.'
  );

  closed = closed.replace(
    '.metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin-top: 6mm; }',
    '.metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }'
  );

  closed = closed.replace(
    /<article class="long-record finding-record">[\s\S]*?<\/article>/g,
    (card) => card.includes('>Priority control weakness<')
      ? card.replaceAll(
          'This is a maturity-limiting control condition.',
          'This is a priority control weakness under the MK methodology.'
        )
      : card
  );

  closed = replaceEvidenceProofRows(closed);
  closed = replaceRecommendedNextStep(closed);
  closed = replaceThirtyDayDecisionCompletionTests(closed);

  // Customer-facing roadmap prose should describe management sequencing, not implementation IDs
  // or the internal deterministic mechanism used to build the roadmap.
  closed = closed
    .replaceAll('The deterministic roadmap records no prerequisite dependency', 'The current roadmap records no prerequisite dependency')
    .replaceAll('Use authoritative roadmap dependency IDs and escalate threatened prerequisites.', 'Approve the prerequisite sequence and escalate threatened prerequisites.');

  // Customer-facing methodology language should explain the rule without exposing implementation
  // terminology that does not help a management reader.
  closed = closed
    .replaceAll('Risk priority is produced by the deterministic qualitative likelihood/impact matrix.', 'Risk priority is produced by the MK qualitative likelihood/impact matrix.')
    .replaceAll('Risk priority uses the deterministic qualitative likelihood/impact matrix.', 'Risk priority uses the MK qualitative likelihood/impact matrix.');

  return closed;
}
