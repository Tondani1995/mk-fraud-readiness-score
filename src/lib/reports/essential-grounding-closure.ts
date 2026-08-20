/**
 * Final closed-set grounding normalisation for customer-facing Essential HTML.
 *
 * This runs before the canonical final-HTML validation gate and may only remove unsupported
 * categorical/invented operating-detail variants that have already appeared in acceptance PDFs.
 * It does not alter scores, findings, owners, target dates, risk priority or control design.
 * Siyakhula V2/V3 acceptance variants are permanently exercised by the provider-free regression.
 */
export function closeResidualEssentialGroundingDefects(html: string): string {
  let closed = html;

  // Capacity absolutes: a self-assessment can establish incomplete monitoring design, but it does
  // not establish a universal fact that manual review is incapable of covering every pattern.
  closed = closed.replace(
    /manual review cannot cover (?:every|all) relevant (?:transaction(?:al)?|transaction) or behavioural pattern(?:s)?/gi,
    'the self-assessment does not establish complete monitoring coverage across the relevant transaction or behavioural population'
  );

  // Location/site mechanics: unless the assessment explicitly provides a multi-site operating
  // model, scenarios must stay at process/population level rather than inventing sites or records
  // remaining at a particular location.
  closed = closed
    .replace(
      /activity (?:being|may be) reviewed locally rather than compared across (?:sites|locations)/gi,
      'activity being reviewed in isolation rather than compared across the complete relevant population'
    )
    .replace(
      /records (?:staying|remaining) with the location where the matter arose/gi,
      'records remaining outside a defined preservation and custody route'
    );

  return closed;
}
