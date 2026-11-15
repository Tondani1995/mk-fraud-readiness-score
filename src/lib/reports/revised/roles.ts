/**
 * FICTIONAL INTEGRATION PROTOTYPE. Consolidated role labels.
 *
 * The draft method names a suggested owner for each of its modules, in 93 different forms ("Head of procurement or
 * CFO", "Procurement or creditors manager", "Procurement manager" ...). Printed as they stand, one report lists the
 * same function under several names. Reports therefore use one label per function, chosen from the first role the
 * method names; the register appendix lists every method label behind each consolidated role, so nothing is lost.
 * The organisation's own job titles are not known to the assessment and are not inferred.
 */
const RULES: [RegExp, string][] = [
  [/^chair|audit committee/i, 'Board or audit committee'],
  [/\bCFO\b|financial director/i, 'Chief financial officer'],
  [/\bCEO\b|^owner|managing partner|chief executive/i, 'Chief executive'],
  [/forensic|investigation/i, 'Investigations lead'],
  [/fraud risk|fraud or risk|risk manager|head of risk/i, 'Fraud risk lead'],
  [/internal audit/i, 'Internal audit'],
  [/legal|compliance|FICA|information officer/i, 'Legal and compliance lead'],
  [/ethics|CSI|sustainability/i, 'Ethics lead'],
  [/\bHR\b|payroll|recruitment|remuneration|learning/i, 'HR and payroll lead'],
  [/\bIT\b|\bCIO\b|information security|digital channels|AI tools/i, 'IT lead'],
  [/procurement|contract manager|bid manager/i, 'Procurement lead'],
  [/financial controller|financial manager|finance manager|treasury|tax manager|grants|creditors|debtors|billing|credit manager/i, 'Finance lead'],
  [/operations|stores|warehouse|logistics|asset|facilities|fleet|security manager|store|branch|cash office|projects/i, 'Operations lead'],
  [/commercial|sales|channel|marketing|communications|customer|claims/i, 'Commercial and customer lead']
];

/** The first role a method label names: "Head of procurement or CFO" is the head of procurement. */
const firstNamed = (label: string) => label.split(/\s+or\s+|,\s*with\s+|\s+and\s+|,\s+/i)[0] ?? label;

export function consolidatedRole(methodLabel: string | null | undefined): string {
  if (!methodLabel) return 'Senior management';
  const first = firstNamed(methodLabel);
  for (const [re, role] of RULES) if (re.test(first)) return role;
  for (const [re, role] of RULES) if (re.test(methodLabel)) return role;
  return 'Senior management';
}

/** Every method label behind each consolidated role used in a report, for the register appendix. */
export function roleMap(labels: (string | null | undefined)[]): { role: string; methodLabels: string[] }[] {
  const m = new Map<string, Set<string>>();
  for (const l of labels) {
    if (!l) continue;
    const r = consolidatedRole(l);
    m.set(r, (m.get(r) ?? new Set()).add(l));
  }
  return [...m.entries()].map(([role, s]) => ({ role, methodLabels: [...s].sort() })).sort((a, b) => a.role.localeCompare(b.role));
}

/**
 * Who oversees the work, from the organisation's own answer to "who has final oversight". Corrected on 12 November:
 * the answer "a board without an audit or risk committee" was previously reported as "the board or its audit committee".
 * Where the question was not answered, the report says so rather than naming a body.
 */
export function oversightBody(governance: string | null | undefined): string {
  switch (governance) {
    case 'committees': return 'The board or its audit or risk committee';
    case 'board': return 'The board';
    case 'owners': return 'The owners';
    case 'parent': return 'The parent company or head office';
    default: return 'The oversight body (not identified in the answers)';
  }
}
