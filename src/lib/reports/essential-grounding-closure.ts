/**
 * Final closed-set grounding normalisation for customer-facing Essential HTML.
 *
 * This runs before the canonical final-HTML validation gate and may only remove unsupported
 * categorical/invented operating-detail variants that have already appeared in acceptance PDFs.
 * It does not alter scores, findings, owners, target dates, risk priority or control design.
 * Siyakhula V2/V3/V4 acceptance variants are permanently exercised by the provider-free regression.
 */
export function closeResidualEssentialGroundingDefects(html: string): string {
  let closed = html;

  // Capacity absolutes: a self-assessment can establish incomplete monitoring design, but it does
  // not establish a universal fact that manual review is incapable of covering every pattern or
  // the organisation's full transaction volume. Keep this family deliberately bounded to the
  // exact capacity assertions observed in acceptance output; ordinary references to manual review
  // remain untouched.
  closed = closed.replace(
    /manual review (?:also )?cannot cover (?:(?:every|all) relevant (?:transaction(?:al)?|transaction) or behavioural pattern(?:s)?|the (?:full|complete) (?:practical range of )?(?:transaction(?:al)?(?: volume)?|transaction volume)(?: or behavioural activity)?)/gi,
    'the self-assessment does not establish complete monitoring coverage across the relevant transaction or behavioural population'
  );

  // Location/site mechanics: unless the assessment explicitly provides a multi-site or
  // local-versus-central operating model, scenarios must stay at process/population level rather
  // than inventing where review happens or where records remain. These substitutions target the
  // provider sentence shapes observed in acceptance output; a grounded statement that simply
  // mentions genuine sites or locations is preserved.
  closed = closed
    .replace(
      /activity (?:being|may be) reviewed locally rather than compared across (?:sites|locations|the complete (?:in-scope|relevant) population)/gi,
      'activity being reviewed in isolation rather than compared across the complete relevant population'
    )
    .replace(
      /without a timely central review route/gi,
      'without a timely defined review route'
    )
    .replace(
      /(?:an )?unusual pattern may not be challenged centrally/gi,
      'an unusual pattern may not be challenged consistently'
    )
    .replace(
      /records (?:staying|remaining) with the location where the matter arose/gi,
      'records remaining outside a defined preservation and custody route'
    );

  return closed;
}
