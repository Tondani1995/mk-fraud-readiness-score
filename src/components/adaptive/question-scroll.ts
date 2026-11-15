/** Scroll geometry only. No scoring, persistence or transition timing decisions. */
export function questionScrollDelta({
  headingTop, headingBottom, contextTop, headerHeight, viewportHeight, preferredAnchor
}: {
  headingTop: number;
  headingBottom: number;
  contextTop: number;
  headerHeight: number;
  viewportHeight: number;
  preferredAnchor: number;
}) {
  const clearTop = headerHeight + 12;
  const headingHeight = headingBottom - headingTop;
  const safeAnchor = Math.max(clearTop, Math.min(preferredAnchor, viewportHeight - headingHeight - 12));
  const headingDelta = headingTop - safeAnchor;
  const contextFits = headingBottom - contextTop <= viewportHeight - clearTop - 12;
  return contextFits ? Math.min(headingDelta, contextTop - clearTop) : headingDelta;
}
