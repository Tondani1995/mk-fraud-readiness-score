/**
 * Presentation-only explanations for the customer-facing V1.2 adaptive journey.
 *
 * The graph remains the authority for prompts, options, applicability and scoring. This finite
 * registry answers “why are you asking me this?” without importing the graph at runtime and without
 * exposing internal node identifiers or scoring mechanics to the respondent.
 */

export const CUSTOMER_EXPLANATIONS: Readonly<Record<string, string>> = Object.freeze({
  // Organisation profile questions.
  G01: "Your operating model shapes where fraud pressure may appear, so later questions can focus on relevant activities.",
  G02: "Organisation size affects how responsibilities, reviews and practical safeguards are organised.",
  G03: "Third parties can introduce risk through onboarding, delivery and payment relationships.",
  G04: "Knowing where supplier decisions sit helps assess oversight when work is shared or outsourced.",
  G05: "Procurement responsibilities determine who can challenge sourcing decisions and spot conflicts.",
  G06: "Cash creates custody and reconciliation points that need attention when it is part of daily operations.",
  G07: "Physical value can be lost or diverted without clear custody, movement and reconciliation.",
  G08: "Payroll ownership helps identify where changes to worker and payment records are reviewed.",
  G09: "Digital channels change how identity, access, transactions and provider reporting should be watched.",
  G10: "Payment routes can create opportunities for manipulation, so the relevant checks need to be understood.",
  G11: "Identity-bearing information needs appropriate access, monitoring and response if it is misused.",
  G12: "Manual changes can bypass ordinary controls, making authorisation and review especially important.",
  G13: "Multiple locations can make consistent custody, approvals and oversight harder to maintain.",
  G14: "Temporary and subcontracted access can introduce joiner, mover, leaver and supervision risks.",
  G15: "Remote access changes how access is granted, monitored and removed outside normal work settings.",
  G16: "Approval arrangements show how the organisation separates decision-making from processing higher-risk spend.",
  G17: "Intermediaries can extend the organisation's reach and require clear standards, monitoring and escalation.",

  // V1.2 active scored controls.
  "D1-Q01": "A clear senior owner gives fraud decisions a place to land and helps unresolved actions stay visible.",
  "D1-Q02": "Fraud risks are easier to manage when they sit inside the organisation's normal governance and risk conversations.",
  "D1-Q03": "Regular reporting helps leadership see patterns, control gaps and overdue action before they become surprises.",
  "D1-Q04": "This separates who makes and funds control decisions from who provides an independent challenge.",
  "D1-Q05": "Written guidance turns expectations into a consistent response when people face a suspected fraud situation.",
  "D1-Q06": "Threat information helps leadership test whether today's priorities still fit the environment.",
  "D1-Q07": "Independent review provides a useful challenge to management's own view of whether key safeguards work.",

  "D2-Q01": "A recent structured view gives the organisation a defensible starting point for prioritising fraud work.",
  "D2-Q02": "Mapping risk to real processes helps reveal where value, authority or information can be manipulated.",
  "D2-Q03": "Changes can introduce new exposure; considering fraud before launch makes safeguards part of the design.",
  "D2-Q04": "Refreshing the view after change keeps it connected to the organisation people actually operate.",
  "D2-Q05": "Third parties can create exposure outside the organisation's direct day-to-day control.",
  "D2-Q06": "External threat signals help identify methods that may not yet have appeared in internal incidents.",
  "D2-Q07": "Thinking through misuse of authority exposes opportunities that ordinary process descriptions can miss.",
  "D2-Q08": "Digital journeys can create distinctive routes for impersonation, manipulation or unauthorised access.",

  "D3-Q01": "Separating key steps reduces the chance that one person can create and conceal an improper transaction.",
  "D3-Q02": "A defined independent challenge is valuable where transaction value or risk makes error or abuse costly.",
  "D3-Q03": "Early supplier checks help prevent fictitious, unsuitable or impersonated counterparties entering the process.",
  "D3-Q04": "Access should follow what a person needs to do now, rather than what they once did.",
  "D3-Q05": "Manual adjustments need a deliberate second look because they can bypass normal transaction controls.",
  "D3-Q06": "Periodic process review can expose workarounds and weak points that routine operation has normalised.",
  "D3-Q07": "Extra oversight or compensating checks can reduce exposure in roles with unusual authority or access.",
  "D3-Q08": "Regular review helps remove access that no longer matches a person's responsibilities.",
  "D3-Q09": "Pre-payment review helps catch altered payroll records, duplicate workers or unusual changes before funds leave.",
  "D3-Q10": "Defined custody and reconciliation make cash differences visible while they can still be investigated.",
  "D3-Q11": "Custody and count discipline helps protect physical value from loss, diversion or unsupported write-offs.",

  "D4-Q01": "Looking for unusual patterns helps surface a problem before it is explained away as ordinary activity.",
  "D4-Q02": "A clear exception route turns an alert into an owned review rather than an unattended report.",
  "D4-Q03": "Different detection methods can reveal suspicious activity that a single report or rule would miss.",
  "D4-Q04": "Detection needs to evolve as fraud methods and operating processes change.",
  "D4-Q05": "Internal misuse often looks like legitimate activity, so the monitoring design needs signals from inside.",
  "D4-Q06": "Escalation authority helps the people who spot concern act before an issue is normalised.",
  "D4-Q07": "Independent effectiveness review tests whether detection works in practice, not just whether it exists.",
  "D4-Q08": "External parties may use customer, supplier, partner or provider channels, so relevant entry points need monitoring.",

  "D5-Q01": "A prepared response reduces delay and uncertainty when a concern needs to be contained and investigated.",
  "D5-Q03": "Clear decision rights prevent cases from stalling or being closed without the right challenge.",
  "D5-Q04": "Documented investigation practice protects fairness, confidentiality and a reliable record of what happened.",
  "D5-Q05": "Preserving relevant information early supports a trustworthy investigation and reduces the chance that facts are lost.",
  "D5-Q06": "Specialist input can be important when an incident needs skills or independence not available internally.",

  "D6-Q01": "A trusted channel gives people a safe route to raise concerns before they become hidden losses.",
  "D6-Q02": "People need to recognise concern and know the route, not simply know that a channel exists.",
  "D6-Q03": "Independent handling reduces the risk that a concern is screened out by someone involved.",
  "D6-Q04": "Clear protection from retaliation makes it more realistic for people to speak up.",
  "D6-Q05": "External parties may see warning signs first, so relevant groups need a usable route.",

  "D7-Q01": "Due diligence helps the organisation understand who it is dealing with before trust and access are granted.",
  "D7-Q02": "Transparent sourcing controls reduce opportunities for collusion and unfair influence.",
  "D7-Q03": "Conflict declarations help decision-makers surface relationships that could distort supplier choices.",
  "D7-Q04": "Payment checks target common routes for diversion after a legitimate supplier relationship exists.",
  "D7-Q05": "Ongoing review matters because a third party's risk can change after onboarding.",
  "D7-Q06": "Oversight helps confirm that vendor activity continues to follow the agreed process.",
  "D7-Q07": "Agents and outsourced partners can extend exposure beyond direct supervision, so expectations must travel with the relationship.",

  "D8-Q01": "Identity checks reduce the chance that a person or counterparty can use someone else's identity to obtain access or value.",
  "D8-Q02": "Watching access, account and transaction signals helps connect warning signs across digital activity.",
  "D8-Q03": "Practical awareness helps people challenge convincing messages and impersonation attempts.",
  "D8-Q04": "Limiting sensitive access reduces the number of paths through which records or confidential information can be misused.",
  "D8-Q06": "A known reporting route helps suspicious digital activity reach someone who can investigate it quickly.",
  "D8-Q07": "Digital fraud changes quickly; periodic review helps keep attention on current methods.",
  "D8-Q08": "Detecting takeover or impersonation early creates an opportunity to contain harm.",
  "D8-Q09": "Periodic recertification helps remove privileged access that has outlived its business need.",
  "D8-Q10": "A tested response helps contain identity misuse and establish what activity or people may be affected.",

  "D9-Q01": "Role-relevant learning makes fraud expectations easier to apply during everyday decisions.",
  "D9-Q02": "Early onboarding guidance gives people a common baseline before they handle sensitive work.",
  "D9-Q03": "Visible leadership expectations set the tone for ethical decisions and make consequences clearer.",
  "D9-Q05": "Concrete examples help people recognise how fraud may appear in their own work.",

  "D10-Q01": "Regular review keeps fraud priorities connected to changes in the organisation and its control environment.",
  "D10-Q02": "Root-cause thinking helps fix the conditions that allowed an incident or control weakness to occur.",
  "D10-Q03": "Lessons create value only when they become owned improvements that are checked after implementation.",
  "D10-Q06": "Leadership attention to effectiveness and resourcing helps prevent controls becoming paper commitments.",

  // Oversight variants are customer-visible when a relevant activity is operated by another party.
  "OV-D3-Q03": "When supplier checks are performed elsewhere, the organisation still needs visibility of the standard, results and exceptions.",
  "OV-D7-Q01": "Outsourcing due diligence does not remove the organisation's responsibility to set and monitor the standard.",
  "OV-D7-Q02": "A delegated procurement process still needs visible safeguards for selection, price integrity and conflicts.",
  "OV-D7-Q04": "When payment controls are performed elsewhere, independent visibility of bank-detail changes and exceptions remains important.",
  "OV-D7-Q05": "Regular risk information helps the organisation challenge whether high-risk third parties remain suitable.",
  "OV-D7-Q06": "Reviewing delegated vendor activity helps confirm that the agreed controls operate in practice.",
  "OV-D8-Q02": "Provider reports are an important part of understanding suspicious activity when a third party runs the channel.",
  "OV-G07": "A payroll register processed by another party still needs an independent check for unusual, duplicate or altered records."
});

export function customerExplanationForNode(nodeId: string): string | null {
  return CUSTOMER_EXPLANATIONS[nodeId] ?? null;
}
