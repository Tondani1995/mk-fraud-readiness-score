import type { MaturityBand } from './types';

type FallbackText = { headline: string; body: string };

export const FALLBACK_EXECUTIVE_DIAGNOSIS: Record<MaturityBand, FallbackText> = {
  Reactive: {
    headline: 'There is no structured fraud defence in place yet',
    body: 'Fraud risk is currently being managed informally and is most likely to be noticed after something has already gone wrong. The fastest improvement is not sophistication; it is foundation: a named owner, a written version of what already happens informally, and a basic response process that does not depend on one person being available when pressure hits.'
  },
  Developing: {
    headline: 'Fraud defences depend on people right now, not systems',
    body: 'Real elements of a fraud defence already exist, which puts the organisation ahead of a purely reactive position. The practical risk is dependency: protection still relies on specific people being present, informed and paying attention, rather than being built into the way the organisation works every day.'
  },
  Structured: {
    headline: 'Real controls exist; the gap is consistency, not intent',
    body: 'This is a credible position. Controls exist and are operating across much of what was assessed. The next step is proving that they work the same way every time, regardless of who is on duty, how busy the team is, or how long it has been since the last incident.'
  },
  Strategic: {
    headline: 'Fraud controls are mature; the next test is pressure',
    body: 'The organisation is ahead of most comparable operating environments. The highest-value work is now testing whether existing controls hold up during a genuine incident, rapid growth, a new digital channel, or a period without the usual oversight in the room.'
  }
};

export const FALLBACK_CAPPED_DIAGNOSIS: FallbackText = {
  // Deliberately count-neutral: this fallback has no visibility into how many maturity_cap_events
  // fired for a given assessment (that context lives in AssembledReportData, not this static table),
  // so it must not assert "a single" gap the way the old copy did -- confirmed wrong on the MK Assist
  // reference assessment, which has 4 separate maturity_cap_events, not 1.
  headline: 'One or more control gaps are holding back a stronger underlying position',
  body: 'Taken purely as a weighted average, this organisation scored {{overallScore}} out of 100, which would ordinarily place it in the {{calculatedMaturity}} readiness band. That average is not the full picture. One or more specific controls scored low enough to cap the final reading to {{finalMaturity}}, because some weaknesses change what the rest of the score is allowed to mean.'
};

export const FALLBACK_FALSE_COMFORT_CAPPED: FallbackText = {
  headline: 'Where this organisation may look stronger than it really is',
  body: 'An average can hide two very different situations behind the same number: consistent, moderate performance everywhere, or strong performance in many places sitting beside one seriously weak control. This result needs the second possibility to be taken seriously. Strength elsewhere cannot fully compensate for a control weakness that changes the overall readiness conclusion.'
};

export const FALLBACK_FALSE_COMFORT_GENERAL: FallbackText = {
  headline: 'Where a strong average can still hide a real gap',
  body: 'A domain score is an average. It can still contain one specific control that is materially weaker than the others feeding into the same number. The purpose of this report is to surface that unevenness so leadership does not treat the overall score as a substitute for control-level attention.'
};

export const FALLBACK_FALSE_COMFORT_CLEAN: FallbackText = {
  headline: 'A clean result does not mean zero risk; it means nothing severe was flagged',
  body: 'No critical or major gaps were flagged in this assessment, which is a positive result. It should still be read alongside the domain pages: an even, moderate score can be reassuring while still leaving room for a specific weak control that did not reach priority-gap level. Consistency is progress; it is not the same claim as no exposure remains.'
};

export const FALLBACK_LEADERSHIP_ATTENTION: Record<MaturityBand, string> = {
  Reactive: 'The immediate priority is visibility: knowing what is happening before a loss reveals it.',
  Developing: 'The immediate risk is dependency on specific people rather than embedded process.',
  Structured: 'The priority is demonstrating reliable controls to external parties, not only having them internally.',
  Strategic: 'The priority is testing whether existing maturity holds under real pressure rather than assuming it will.'
};

export const FALLBACK_DOMAIN_CONTENT: Record<string, Record<MaturityBand, FallbackText>> = {
  'Fraud Leadership and Governance': {
    Reactive: { headline: 'Nobody owns this until something goes wrong', body: 'Fraud risk currently has no clear home. When something happens, people react; before that point, no single person is accountable for whether the organisation is prepared. That gap is usually invisible until the moment it matters most.' },
    Developing: { headline: 'Ownership exists, but authority is not yet clear', body: 'Someone is nominally responsible for fraud risk, but the reporting rhythm, decision rights and visibility to leadership are not yet consistent. Ownership without a defined forum can quietly become a part-time responsibility.' },
    Structured: { headline: 'Governance is real, but now needs evidence', body: 'There is a genuine owner, a recognised place in the risk framework and a reporting rhythm to leadership. The next test is whether that structure would hold up under a board question, insurer review or external due-diligence request.' },
    Strategic: { headline: 'Leadership treats fraud as a strategic risk', body: 'Fraud risk sits inside genuine governance: named ownership, independent review and a leadership rhythm that keeps pace with change. The work now is to keep that rhythm visible and evidence-led.' }
  },
  'Fraud Risk Identification': {
    Reactive: { headline: 'Risk is discovered after it happens, not before', body: 'There is no structured map of where fraud risk sits in the business. Without that map, exposure is likely to be discovered only after a loss, complaint or near miss has already surfaced it.' },
    Developing: { headline: 'Some risks are known; the full picture is not', body: 'Parts of the business have been reviewed for fraud risk, but the exercise is not systematic across the operating model. Gaps in the map are invisible by definition until something forces them into view.' },
    Structured: { headline: 'The organisation knows where fraud risk lives', body: 'A structured risk assessment exists and covers the processes where fraud typically originates. The main work is keeping that map current as systems, suppliers, channels and roles change.' },
    Strategic: { headline: 'Risk identification keeps pace with change', body: 'Fraud risk is not treated as a once-off exercise. The organisation actively re-examines risk as new systems, channels and supplier relationships are introduced.' }
  },
  'Operational Fraud Controls': {
    Reactive: { headline: 'Day-to-day processes have little built-in protection', body: 'Segregation of duties, approval limits and access reviews are largely absent or ad hoc. Fraud tends to find the gap nobody was watching, and there are currently more unwatched gaps than watched ones.' },
    Developing: { headline: 'Some controls exist, unevenly applied', body: 'Certain processes have real safeguards while others still rely on trust and familiarity. That unevenness means protection depends on which part of the business a transaction passes through.' },
    Structured: { headline: 'Core processes are genuinely protected', body: 'Segregation of duties, access controls and review of sensitive manual activity are operating in the processes that matter most. The next risk is not total absence; it is the gap between controls.' },
    Strategic: { headline: 'Controls are part of how work gets done', body: 'Operational controls are embedded in normal work rather than sitting above it as an overlay. That is hard to build and easy to erode during growth, restructuring or pressure.' }
  },
  'Fraud Detection Capability': {
    Reactive: { headline: 'Nothing is watching for unusual activity yet', body: 'Without monitoring or exception reporting, the organisation is relying on prevention working perfectly. It never does. There is no reliable second line behind the first.' },
    Developing: { headline: 'Monitoring exists, but escalation is weak', body: 'Basic monitoring is present in parts of the business, but it is not clear that a genuine red flag would reliably reach someone with the authority and urgency to act.' },
    Structured: { headline: 'The organisation can catch what prevention misses', body: 'Monitoring, exception reporting and escalation exist and function. The next question is whether detection keeps pace as fraud methods and data patterns change.' },
    Strategic: { headline: 'Detection is proactive, not just alert-driven', body: 'Analytics and monitoring are updated as fraud methods evolve. That forward-looking posture is what keeps detection from quietly falling behind.' }
  },
  'Fraud Incident Response': {
    Reactive: { headline: 'A real incident would be improvised', body: 'There is no documented process for what happens when fraud is suspected. The first real incident would become a live test of judgement under pressure, without a playbook to lean on.' },
    Developing: { headline: 'A process exists on paper, but is untested', body: 'Some response elements exist, but roles, evidence handling and escalation are not fully defined. A plan that has only lived on paper behaves differently under real pressure.' },
    Structured: { headline: 'An incident would be handled, not improvised', body: 'A documented response process exists, roles are defined and evidence handling is taken seriously. The remaining question is whether that process has been rehearsed.' },
    Strategic: { headline: 'Incidents make the organisation better', body: 'Lessons from incidents are fed back into stronger controls. That feedback loop turns incident response from containment into continuous improvement.' }
  },
  'Whistleblowing and Reporting Culture': {
    Reactive: { headline: 'There is no safe route to raise concerns', body: 'Without a confidential channel, concerns about fraud or misconduct either go nowhere or move through informal, unprotected routes. Silence can easily be mistaken for the absence of a problem.' },
    Developing: { headline: 'A channel exists, but trust is unproven', body: 'A reporting mechanism is available, but it is not clear employees know about it, trust it or believe reports will be handled independently and without retaliation.' },
    Structured: { headline: 'People have a credible way to speak up', body: 'A confidential reporting channel exists and reports are reviewed independently. Trust in a channel is fragile, so consistent handling and visible independence matter most.' },
    Strategic: { headline: 'Reporting culture extends beyond employees', body: 'Reporting channels reach external stakeholders such as suppliers, contractors or customers, widening the opportunity to detect issues early.' }
  },
  'Third-Party and Supply Chain Fraud Risk': {
    Reactive: { headline: 'Suppliers are trusted by default', body: 'There is little due diligence on new suppliers or contractors, and payment processes offer limited protection against invoice manipulation or vendor impersonation. Third-party risk is unmanaged rather than consciously accepted.' },
    Developing: { headline: 'Checks happen, but monitoring stops too early', body: 'New suppliers receive some scrutiny, but that scrutiny does not continue once the relationship is established. A legitimate long-standing relationship can still become a fraud risk.' },
    Structured: { headline: 'Supplier risk is managed, with thinner edge visibility', body: 'Due diligence and payment safeguards exist for suppliers and third parties. Ongoing monitoring is where attention should concentrate next, because third-party risk often moves outside direct visibility.' },
    Strategic: { headline: 'Third-party risk is monitored continuously', body: 'Vendor and supplier relationships are reviewed over time, not treated as a one-time gate. That continuous view is what catches trusted relationships that quietly become risky.' }
  },
  'Digital and Identity Fraud Risk': {
    Reactive: { headline: 'Digital channels have grown faster than controls', body: 'Identity verification and digital monitoring are minimal or absent. This is the fastest-moving fraud category assessed, and current protection is thin against the risk that changes quickest.' },
    Developing: { headline: 'Digital controls exist in parts, not as a system', body: 'Some identity and digital monitoring controls are present, but not consistently across every channel or system. Partial coverage tends to be found by whoever is looking for the gap.' },
    Structured: { headline: 'Digital controls are real, but need frequent review', body: 'Identity verification and digital monitoring are in place. Because digital fraud methods evolve quickly, adequate controls here have a shorter shelf life than in many other domains.' },
    Strategic: { headline: 'Digital and identity controls are ahead of a fast-moving threat', body: 'Controls are strong, but sustaining that position requires frequent review. What counts as strong today will not automatically remain strong in twelve months.' }
  },
  'Fraud Culture and Awareness': {
    Reactive: { headline: 'People have not been taught what to look for', body: 'Without training or awareness activity, employees are not equipped to recognise fraud risk even when it is directly in front of them. Awareness is a control in its own right and is currently largely absent.' },
    Developing: { headline: 'Awareness exists, but has not become habit', body: 'Some training has happened, but it is unclear whether it changed day-to-day behaviour or whether it was a once-off event that has since faded.' },
    Structured: { headline: 'People are trained to notice real scenarios', body: 'Fraud awareness training happens and uses practical examples, not only abstract policy. The next step is measuring whether awareness changes behaviour.' },
    Strategic: { headline: 'Awareness is reinforced by current examples', body: 'Training uses real scenarios and lessons learned, which keeps awareness current rather than becoming an annual formality.' }
  },
  'Continuous Improvement and Fraud Risk Monitoring': {
    Reactive: { headline: 'Controls are set once and not revisited', body: 'There is no habit of reviewing whether fraud controls still work or still matter. A control environment that has not been reviewed recently is not stable; it is untested against current risks.' },
    Developing: { headline: 'Reviews happen occasionally, not rhythmically', body: 'Some review of controls and incidents takes place, but without a defined rhythm it can slip during busy periods, which is often exactly when review matters most.' },
    Structured: { headline: 'The organisation reviews itself, but speed matters', body: 'Fraud risk and controls are periodically reviewed, and incidents feed improvement. As the organisation and threat landscape change, the speed of review matters as much as its existence.' },
    Strategic: { headline: 'Fraud readiness is treated as a moving target', body: 'Reviews happen often enough to track how the organisation and threat landscape are changing, rather than assuming what worked last year still works.' }
  }
};

export function getDomainFallback(domainName: string, band: MaturityBand): FallbackText {
  const content = FALLBACK_DOMAIN_CONTENT[domainName]?.[band];
  if (content) return content;
  return {
    headline: `${domainName}: ${band.toLowerCase()} position`,
    body: `${domainName} was assessed at a ${band} level. The detailed advisory interpretation for this domain should be reviewed with MK Fraud Insights during the report walkthrough.`
  };
}
