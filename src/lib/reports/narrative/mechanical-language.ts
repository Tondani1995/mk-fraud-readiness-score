export const MECHANICAL_LANGUAGE_VERSION = 'mk-reporting-bible-1.1-mechanical-language-v1';

/**
 * Engine language that leaks into customer prose.
 *
 * None of these phrases is banned outright. A report legitimately establishes
 * once that its analysis derives from management's own assessment. What reads
 * as machine narration is the same construction repeating: "the recorded
 * position", "is recorded at 73.57", "the recorded weakness". So each family
 * carries an allowance, and only saturation above that allowance fails.
 *
 * Allowances are deliberately generous per slot and tight per report, because
 * the observed defect was two occurrences in each of eleven slots — invisible
 * to any per-slot threshold, obvious to a reader.
 */
export interface MechanicalTermFamily {
  family: string;
  /** Matched case-insensitively against customer prose. */
  patterns: RegExp[];
  perSlotAllowance: number;
  perReportAllowance: number;
  guidance: string;
}

export const MECHANICAL_TERM_FAMILIES: MechanicalTermFamily[] = [
  {
    family: 'recorded',
    patterns: [/\brecorded\b/gi, /\bis recorded at\b/gi, /\bthe assessment recorded\b/gi],
    perSlotAllowance: 2,
    perReportAllowance: 5,
    guidance: 'Say what the position is rather than that it was recorded. "Monitoring capability remains reactive." rather than "the recorded monitoring position is reactive."'
  },
  {
    family: 'self-assessed',
    patterns: [/\bself-assessed\b/gi, /\bself assessed\b/gi],
    perSlotAllowance: 1,
    perReportAllowance: 2,
    guidance: 'The assessment basis is established once in the report. Do not restate it in every section.'
  },
  {
    family: 'management should',
    patterns: [/\bmanagement should\b/gi],
    // A section whose whole purpose is what management should change will use
    // the phrase legitimately, so the per-section allowance is deliberately
    // looser than the report allowance. Saturation across the report is the
    // defect, not use within one section.
    perSlotAllowance: 3,
    perReportAllowance: 8,
    guidance: 'Vary the construction: "The priority is...", "This requires...", name the owner and the action directly.'
  },
  {
    family: 'approved response',
    patterns: [/\bthe approved response\b/gi, /\brecorded response\b/gi],
    perSlotAllowance: 1,
    perReportAllowance: 2,
    guidance: 'Describe the response itself rather than its status in the engine.'
  },
  {
    family: 'condition/weakness narration',
    patterns: [/\brecorded condition\b/gi, /\brecorded weakness\b/gi, /\brecorded position\b/gi],
    perSlotAllowance: 1,
    perReportAllowance: 2,
    guidance: 'Name the control or capability rather than referring to a recorded condition.'
  }
];

export interface MechanicalFamilyFinding {
  family: string;
  count: number;
  allowance: number;
  /** Occurrences per 1,000 words. */
  density: number;
  guidance: string;
}

export interface MechanicalSlotFinding extends MechanicalFamilyFinding {
  slotId: string;
}

export interface MechanicalLanguageReport {
  ok: boolean;
  version: typeof MECHANICAL_LANGUAGE_VERSION;
  totalWords: number;
  reportFindings: MechanicalFamilyFinding[];
  slotFindings: MechanicalSlotFinding[];
  /** Slots to repair, worst first, deduplicated. */
  repairTargets: Array<{ slotId: string; reason: string }>;
}

function countMatches(text: string, patterns: RegExp[]): number {
  // Overlapping families (for example "recorded" and "recorded position") are
  // counted per family, so each family reports its own saturation independently.
  let total = 0;
  for (const pattern of patterns) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
    total += matches ? matches.length : 0;
  }
  return total;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function analyseSlotMechanicalLanguage(slotId: string, prose: string): MechanicalSlotFinding[] {
  const total = wordCount(prose);
  const findings: MechanicalSlotFinding[] = [];
  for (const family of MECHANICAL_TERM_FAMILIES) {
    const count = countMatches(prose, family.patterns);
    if (count > family.perSlotAllowance) {
      findings.push({
        slotId,
        family: family.family,
        count,
        allowance: family.perSlotAllowance,
        density: total ? Number(((count / total) * 1000).toFixed(2)) : 0,
        guidance: family.guidance
      });
    }
  }
  return findings;
}

/**
 * Report-level saturation. Catches the case a per-slot threshold cannot see:
 * a construction used a couple of times in every section.
 */
export function analyseMechanicalLanguage(slots: Array<{ slotId: string; prose: string }>): MechanicalLanguageReport {
  const allProse = slots.map((slot) => slot.prose).join('\n');
  const totalWords = wordCount(allProse);
  const reportFindings: MechanicalFamilyFinding[] = [];
  const repairTargets: Array<{ slotId: string; reason: string }> = [];

  for (const family of MECHANICAL_TERM_FAMILIES) {
    const count = countMatches(allProse, family.patterns);
    if (count <= family.perReportAllowance) continue;
    reportFindings.push({
      family: family.family,
      count,
      allowance: family.perReportAllowance,
      density: totalWords ? Number(((count / totalWords) * 1000).toFixed(2)) : 0,
      guidance: family.guidance
    });
    // Charge the overage to the slots using the family most heavily, worst first,
    // taking only as many slots as are needed to bring the report inside its
    // allowance. Every other approved slot stays untouched.
    const ranked = slots
      .map((slot) => ({ slotId: slot.slotId, count: countMatches(slot.prose, family.patterns) }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);
    let remaining = count - family.perReportAllowance;
    for (const entry of ranked) {
      if (remaining <= 0) break;
      repairTargets.push({
        slotId: entry.slotId,
        reason: `This section uses "${family.family}" language ${entry.count} time(s); the report as a whole uses it ${count} times against an allowance of ${family.perReportAllowance}. ${family.guidance} Remove or rephrase these occurrences here without changing any fact, number, claim reference or required insight. Preserve the section's existing structure, including any 30/60/90 day sequencing, owner names and ordering.`
      });
      remaining -= entry.count;
    }
  }

  const slotFindings = slots.flatMap((slot) => analyseSlotMechanicalLanguage(slot.slotId, slot.prose));
  for (const finding of slotFindings) {
    repairTargets.push({
      slotId: finding.slotId,
      reason: `This section uses "${finding.family}" language ${finding.count} time(s) against a per-section allowance of ${finding.allowance}. ${finding.guidance} Rephrase without changing any fact, number, claim reference or required insight. Preserve the section's existing structure, including any 30/60/90 day sequencing, owner names and ordering.`
    });
  }

  const seen = new Set<string>();
  const deduped = repairTargets.filter((target) => (seen.has(target.slotId) ? false : (seen.add(target.slotId), true)));

  return {
    ok: reportFindings.length === 0 && slotFindings.length === 0,
    version: MECHANICAL_LANGUAGE_VERSION,
    totalWords,
    reportFindings,
    slotFindings,
    repairTargets: deduped
  };
}
