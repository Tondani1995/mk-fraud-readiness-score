/**
 * Final deterministic customer-output closure for the Essential report.
 *
 * These are presentation corrections only. They do not change scores, finding selection,
 * risk ratings, payment state, provider behaviour or fulfilment. The closure is deliberately
 * applied after the commercial-quality gate has rendered the authoritative HTML and before
 * Chromium converts that HTML to PDF, so the paid artefact cannot re-introduce the Bokamoso
 * V1/V2 customer-visible defects through pagination or generic deterministic wording.
 *
 * Keep every transformation exact and idempotent. If upstream wording changes, the permanent
 * regression should force an explicit decision rather than silently broadening these rules.
 */
export function closeEssentialCommercialOutputDefects(html: string): string {
  let closed = html;

  // A 0-2 response range includes Partially designed. It must never be labelled simply "absent".
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

  // Keep the four executive KPI cells together as one print unit.
  closed = closed.replace(
    '.metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin-top: 6mm; }',
    '.metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }'
  );

  // A card labelled Priority control weakness must not describe itself as a maturity constraint.
  closed = closed.replace(
    /<article class="long-record finding-record">[\s\S]*?<\/article>/g,
    (card) => card.includes('>Priority control weakness<')
      ? card.replaceAll(
          'This is a maturity-limiting control condition.',
          'This is a priority control weakness under the MK methodology.'
        )
      : card
  );

  // The old fallback stitched an artefact name and a questionnaire prompt into ungrammatical prose.
  closed = closed.replace(
    /Whether the [^<]+? provides operating evidence that [^<]+? is implemented across the complete in-scope population\./gi,
    'This evidence should demonstrate that the linked control requirements operate consistently across the complete in-scope population.'
  );

  // The assessment contains no transaction-volume evidence that can support the previous absolutes.
  closed = closed.replace(
    /Manual review cannot cover transaction volume, so without data-driven tests the majority of activity is never examined and structured schemes persist undetected\./gi,
    'Where data-driven detection is not defined and operated reliably, suspicious patterns and structured schemes may not be consistently surfaced for review or escalation.'
  );

  return closed;
}
