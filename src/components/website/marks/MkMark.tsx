/**
 * MK mark family.
 *
 * A small set of bespoke functional marks drawn for MK Fraud Insights rather than taken from an icon
 * library. Every mark sits on the same 16-unit grid, uses one 1.5-unit stroke with butt ends and
 * mitred corners (the same construction as the hairlines and tick marks in the corporate profile
 * diagrams), and inherits `currentColor`. Marks are only used where they carry an established
 * usability meaning: direction of travel, leaving the page, or opening detail. Decorative symbols
 * (shields, padlocks, sector pictograms) are deliberately not part of the family.
 */
type MarkName = 'arrow' | 'arrowOut' | 'arrowDown' | 'arrowBack';

const PATHS: Record<MarkName, string> = {
  // Horizontal shaft with a short, open head; head length is a quarter of the grid.
  arrow: 'M2 8h11.5M9.5 4l4 4-4 4',
  // Leaving the page: the same head rotated to 45 degrees, shaft drawn from the lower-left corner.
  arrowOut: 'M4 12l7.5-7.5M5.5 4h6.5v6.5',
  arrowDown: 'M8 2v11.5M4 9.5l4 4 4-4',
  arrowBack: 'M14 8H2.5M6.5 4l-4 4 4 4'
};

export function MkMark({ name, className = 'h-4 w-4' }: { name: MarkName; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      // Inline style so global `svg { stroke-linecap: round }` rules cannot soften the construction.
      style={{ strokeLinecap: "butt", strokeLinejoin: "miter" }}
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
