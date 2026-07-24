// CSV cell safety for admin-facing exports: RFC 4180 quoting plus a spreadsheet
// formula-injection guard (OWASP CSV Injection). A cell whose first *meaningful*
// character (after skipping leading spaces, tabs, and other control characters that
// some spreadsheet apps still honour as a formula prefix) is one of = + - @ is
// treated by Excel/Sheets/LibreOffice as a formula, not text. The only columns this
// export streams that contain free admin-typed text are resolution_note and
// next_action; every other column is a controlled enum, date, count, or UUID.
// We neutralise by prefixing a single quote, which every major spreadsheet app
// interprets as "force text" and does not display in the cell — this preserves the
// visible value rather than stripping or rejecting it.

const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@']);

export function startsWithFormulaTrigger(text: string): boolean {
  for (const char of text) {
    if (char === ' ' || char === '\t' || char.charCodeAt(0) < 0x20) continue;
    return FORMULA_TRIGGER_CHARS.has(char);
  }
  return false;
}

export function neutraliseFormulaInjection(text: string): string {
  return startsWithFormulaTrigger(text) ? `'${text}` : text;
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = neutraliseFormulaInjection(String(value));
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
