/**
 * Draft scenario structures (Reporting Bible v1.1, section 11.3): the ten elements every fraud pathway in a paid
 * report must contain, for the scenarios the four fictional reports develop.
 *
 * FICTIONAL PROTOTYPE. MK advisory content awaiting MK approval, in the same position as the control-content
 * library: generic to the scenario, never to an organisation. Each structure restates the method's own scenario
 * (bank 1.3 `how` and `why`) as a pathway and draws on MK's existing MFRS scenario mechanisms where one applies. No
 * structure names a supplier, person, system, amount or incident; the writer ties the pathway to the organisation
 * only through the Fact Pack (which controls the organisation reports absent or weaker).
 */
export const SCENARIO_STRUCTURE_VERSION = 'scenario-structures-0.1';
export type ScenarioStructure = {
  title: string; actor: string; opportunity: string; entryPoint: string; mechanism: string; controlRelied: string;
  concealment: string; consequence: string; warningIndicators: string[]; containment: string; longTerm: string; sources: string[];
};

export const SCENARIO_STRUCTURES: Record<string, ScenarioStructure> = {
  'FS-D4-02': {
    title: 'A supplier\'s bank details are changed and the next payment run pays the fraudster',
    actor: 'An outsider impersonating an established supplier, typically after compromising the supplier\'s email or obtaining its invoice templates.',
    opportunity: 'The organisation pays the supplier regularly, so a change of bank details is routine and expected.',
    entryPoint: 'A request to update the supplier\'s banking details, sent by email on the supplier\'s letterhead and sometimes followed by a call from someone who sounds like the usual contact.',
    mechanism: 'The change is captured on the supplier master file. The next legitimate invoice is approved and paid in the normal payment run, to the new account.',
    controlRelied: 'The change is accepted without confirming it with the supplier through contact details already on file, and a familiar voice on a call is treated as confirmation.',
    concealment: 'Every document in the payment file is genuine: the invoice, the approval and the payment run. Nothing looks wrong until the real supplier asks why it has not been paid.',
    consequence: 'A genuine payment is lost to an account that is usually emptied within hours, the supplier still has to be paid, and recovery depends on how quickly the bank is alerted.',
    warningIndicators: ['A bank-detail change shortly before a large or scheduled payment', 'A change request that arrives by email or from a new contact', 'Pressure to make the change before the next payment run', 'A supplier querying non-payment after a recent change'],
    containment: 'Contact the bank immediately to recall or freeze the payment, confirm the correct details with the supplier through a number already on file, suspend further payments to the changed account and preserve the request and approval trail.',
    longTerm: 'Every change to supplier bank details is confirmed with the supplier through contact details on file before it takes effect, by someone other than the person who captured it, whatever the caller appears to be.',
    sources: ['bank 1.3 FS-D4-02', 'MFRS mechanism supplier_payment_redirection']
  },
  'FS-D4-12': {
    title: 'Split orders and duplicate invoices pass because nobody looks across the payments',
    actor: 'A buyer or finance clerk acting alone, or a supplier who deliberately invoices twice.',
    opportunity: 'Each order and each invoice is checked on its own, so a pattern that only shows across many transactions is never seen.',
    entryPoint: 'A purchase split into several orders that each fall under the approval limit, or an invoice resubmitted with a changed number or date.',
    mechanism: 'Each order is approved within its limit and each invoice passes its own checks, so a purchase that should have gone to tender, or an invoice already paid, is processed in the ordinary way.',
    controlRelied: 'No one independent of processing reviews the supplier payments as a population, for splitting, duplicates, unfamiliar suppliers or changed bank details.',
    concealment: 'Every individual transaction is within policy; only the pattern is wrong, and the pattern is in data that nobody examines.',
    consequence: 'Overpayment, purchases that bypass competitive tender, and a continuing loss that grows with each payment run until a supplier, an auditor or a whistle-blower raises it.',
    warningIndicators: ['Several orders to one supplier just below an approval limit', 'Invoices with the same amount and supplier close together', 'A supplier paid more often than its contract suggests', 'Orders raised and received by the same person'],
    containment: 'Stop further payments on the suspect orders or invoices, recover any duplicate payment from the supplier, and preserve the order, approval and payment records.',
    longTerm: 'A senior manager who does not process payments reviews each month\'s supplier payments for splitting, duplicates, unfamiliar suppliers and changed bank details, and follows up each query.',
    sources: ['bank 1.3 FS-D4-12', 'MFRS question D4-Q04 playbook']
  },
  'FS-D7-03': {
    title: 'Fabricated payslips and bank statements secure credit that is never repaid',
    actor: 'An applicant, sometimes working with others, using documents generated or altered to show income they do not have.',
    opportunity: 'The organisation extends credit to customers and approves applications on the documents supplied.',
    entryPoint: 'A credit application supported by a payslip and bank statement that look entirely genuine.',
    mechanism: 'The documents pass a visual check, the application is approved, goods are taken on credit, and the account is not repaid. Where the scheme works once, the same templates are used again.',
    controlRelied: 'The key information in the application is not verified with its source, such as the employer, the bank or a verification service, before credit is approved.',
    concealment: 'The loss appears as an ordinary bad debt months later, so the application fraud behind it is not recognised and the pattern repeats.',
    consequence: 'Credit losses that are recorded as bad debt rather than fraud, repeated losses from the same document templates, and goods lost without recovery.',
    warningIndicators: ['Accounts that default on the first or second instalment', 'Applications with the same employer, payslip layout or contact details', 'Income that is high for the goods applied for', 'Pressure to approve quickly'],
    containment: 'Suspend further credit on linked applications, review the other applications from the same source or template, and preserve the application files.',
    longTerm: 'The key information in every credit application is verified with its source before credit is approved, and first-instalment defaults are reviewed for application fraud.',
    sources: ['bank 1.3 FS-D7-03']
  },
  'FS-D8-02': {
    title: 'Stock is removed and the count is made to agree',
    actor: 'An employee with custody of stock, sometimes working with a driver, a supplier or a colleague.',
    opportunity: 'The people who hold the stock also count it, so the record that should reveal a loss is prepared by the person who would cause it.',
    entryPoint: 'A routine stock count at a store, warehouse or depot.',
    mechanism: 'Stock is removed over time. When the count is done, the counter records the expected quantities, or attributes the shortfall to damage, write-off or a counting error.',
    controlRelied: 'Counts are not carried out or checked by people independent of the stock\'s custody, and shortfalls are not compared with an independent expected quantity.',
    concealment: 'The count agrees with the system, so the loss never appears; where it does, it is explained as ordinary shrinkage.',
    consequence: 'Continuing stock loss that is absorbed into margin, write-offs that hide theft, and no record of where losses occur.',
    warningIndicators: ['Shrinkage concentrated at one site or on particular lines', 'Write-offs and adjustments by the person responsible for the stock', 'Counts that always agree exactly', 'Reluctance to allow others to count'],
    containment: 'Carry out an immediate blind count by people independent of the site, secure the stock area, and preserve the count sheets, adjustments and access records.',
    longTerm: 'Stock is counted blind by people independent of its custody, differences are investigated before any adjustment, and losses are tracked by location.',
    sources: ['bank 1.3 FS-D8-02']
  },
  'FS-D9-03': {
    title: 'A cloned voice of a senior person instructs an urgent payment',
    actor: 'An outsider using a cloned voice, a voice note or a manipulated video of an executive or owner, built from recordings that are publicly available.',
    opportunity: 'Staff act on instructions from senior people, and recognising the voice has always been enough.',
    entryPoint: 'A call or voice note, apparently from the chief executive or owner, asking for an urgent and confidential payment.',
    mechanism: 'The instruction is urgent and comes from a voice the employee knows, so the payment is made outside the normal process or pushed through it quickly.',
    controlRelied: 'There is no agreed method, such as a call-back on a known number or a code word, that verifies a request made by phone, voice note or video, and executives are not bound by it.',
    concealment: 'The employee believes the instruction was genuine and the payment appears properly authorised until the executive is asked about it.',
    consequence: 'A payment lost to an account that is quickly emptied, with the added harm that staff no longer trust instructions from their own leaders.',
    warningIndicators: ['An instruction that insists on secrecy or bypasses the normal process', 'Urgency with a reason why the executive cannot be called back', 'A request from an unfamiliar number or account', 'A new beneficiary on an executive instruction'],
    containment: 'Call the executive back on a known number, contact the bank to recall the payment, and preserve the call, message and payment records.',
    longTerm: 'An agreed verification method applies to every request made by phone, voice note or video, to everyone including executives, and staff are expected to use it.',
    sources: ['bank 1.3 FS-D9-03', 'MFRS mechanism account_takeover']
  },
  'FS-D5-12': {
    title: 'An insider who never hands over their work conceals a fraud for years',
    actor: 'A trusted employee in a sensitive role, such as payroll, creditors or stock, who has worked unchallenged for a long time.',
    opportunity: 'The role is held by one person who never takes extended leave and whose work is never done by anyone else.',
    entryPoint: 'The employee\'s ordinary, daily processing in their own area.',
    mechanism: 'The employee manipulates the records they control, and keeps the scheme alive by being present for every transaction and every query that could expose it.',
    controlRelied: 'People in sensitive roles are not required to take block leave during which someone else does their work, and the roles that need it are not identified.',
    concealment: 'The fraud needs continuous attention, which the employee gives; with nobody else ever doing the work, the anomalies are never seen.',
    consequence: 'A long-running loss that is usually discovered by chance and is large by the time it is found.',
    warningIndicators: ['An employee in a sensitive role who does not take leave', 'Work that only one person understands or is allowed to do', 'Queries that are always routed to the same person', 'Resistance to rotation or process change'],
    containment: 'Place the work with someone else immediately, review the period\'s transactions, and preserve the records before the employee is approached.',
    longTerm: 'Sensitive roles are identified and recorded, and everyone in them takes block leave each year during which someone else does their work.',
    sources: ['bank 1.3 FS-D5-12']
  },
  'FS-D2-02': {
    title: 'A deepfake instruction, synthetic identity or generated document defeats a control that relies on recognition',
    actor: 'An outsider using AI tools to imitate a known person, create a synthetic identity or generate a convincing document.',
    opportunity: 'Several controls rely on recognising a voice, a face, a signature or a document, and AI can now imitate each of them cheaply.',
    entryPoint: 'An instruction, application or document presented through the organisation\'s ordinary channels.',
    mechanism: 'The control does what it was designed to do, but the thing it recognises is fake, so a payment, account or approval is granted on false grounds.',
    controlRelied: 'The fraud risk assessment has not asked, for each high-risk process, how AI could be used against the controls in it, so the controls have not been tested or redesigned for this.',
    concealment: 'The control appears to have operated correctly, so the failure is not visible in its records.',
    consequence: 'Losses through controls that management believes are effective, and a fraud risk assessment that understates exposure in exactly the processes that matter.',
    warningIndicators: ['Requests that rely only on recognising a person or document', 'Documents with flawless formatting from new counterparties', 'Video or voice contact that avoids interaction', 'Identity details that fit together too neatly'],
    containment: 'Confirm the instruction or document with its source through a separate known channel, and suspend reliance on recognition-only checks in the process concerned.',
    longTerm: 'The fraud risk assessment asks, for each high-risk process, how AI could be used against its controls, and controls that rely on recognition are tested and redesigned.',
    sources: ['bank 1.3 FS-D2-02']
  },
  'FS-D4-05': {
    title: 'Invoices are paid for goods that were never delivered or services never performed',
    actor: 'A supplier inflating its billing, sometimes with the help of an employee who approves the invoices.',
    opportunity: 'Invoices are paid on approval, without a consistent check that what is invoiced was ordered and received.',
    entryPoint: 'An invoice for a delivery, a service or a rate that differs from what was agreed or received.',
    mechanism: 'The invoice is approved by someone who did not receive the goods or confirm the service, and it is paid in the normal run.',
    controlRelied: 'Receipt is not recorded before payment for every invoice, and service delivery is not confirmed by the person who received it.',
    concealment: 'The invoice carries an approval, so it looks properly processed; overbilling is hidden among ordinary invoices.',
    consequence: 'Continuing overpayment, which grows where an employee shares in it, and spend that cannot be reconciled to what the organisation actually received.',
    warningIndicators: ['Invoices without a matching receipt or delivery note', 'Rates above the agreed contract', 'Service invoices approved by people far from the work', 'One approver for a supplier\'s invoices over a long period'],
    containment: 'Hold payment on the suspect invoices, reconcile them to orders and receipts, and preserve the approval trail.',
    longTerm: 'Every invoice is matched to an approved order and a recorded receipt or confirmed service before payment.',
    sources: ['bank 1.3 FS-D4-05']
  },
  'FS-D9-01': {
    title: 'An email account is taken over and the organisation\'s own invoices are used to divert its income',
    actor: 'An outsider who gains access to a staff mailbox through a stolen password.',
    opportunity: 'The mailbox has no multi-factor sign-in, so a password is enough to enter it, read correspondence and send from it.',
    entryPoint: 'A phishing message or a password reused from another site.',
    mechanism: 'The attacker watches correspondence with clients and, at the right moment, sends a genuine-looking invoice or notice with changed bank details from the real account.',
    controlRelied: 'Email accounts are not protected by multi-factor sign-in.',
    concealment: 'The message comes from the organisation\'s real address, so clients have no reason to doubt it; the attacker may set rules that hide replies from the mailbox owner.',
    consequence: 'Client payments are lost, the organisation may still need to recover its fees, and clients\' trust in its correspondence is damaged.',
    warningIndicators: ['Clients querying a change of bank details', 'Unfamiliar sign-ins or forwarding rules on a mailbox', 'Sent messages the owner did not write', 'A drop in expected receipts'],
    containment: 'Reset the account and remove any forwarding rules, notify clients through a known channel, and preserve the sign-in and message logs.',
    longTerm: 'Every email account is protected by multi-factor sign-in, and clients are told how the organisation will confirm any change of bank details.',
    sources: ['bank 1.3 FS-D9-01', 'MFRS mechanism account_takeover']
  },
  'FS-D9-02': {
    title: 'A payment instruction received by email is acted on without separate confirmation',
    actor: 'An outsider sending a convincing email that appears to come from the owner, a supplier or a client.',
    opportunity: 'Payment, salary and urgent requests received by email are processed on the strength of the email itself.',
    entryPoint: 'An email instructing an urgent payment or a change of bank details, often timed for when the sender is known to be unavailable.',
    mechanism: 'The request looks routine and comes from a familiar name, so it is processed in the ordinary way.',
    controlRelied: 'There is no organisation-wide rule requiring every payment, salary or urgent request received by email to be confirmed through a separate, known channel.',
    concealment: 'The payment is properly processed against a request that appears genuine; the fraud is found only when the supposed sender is asked.',
    consequence: 'A payment lost to an account that is quickly emptied, and recovery that depends on how quickly the bank is alerted.',
    warningIndicators: ['Urgency and a reason why the sender cannot be reached', 'A new beneficiary or changed bank details', 'A slightly different email address', 'An instruction to keep the request confidential'],
    containment: 'Contact the bank to recall the payment, confirm with the supposed sender through a known number, and preserve the email and payment records.',
    longTerm: 'Every payment, salary or urgent request received by email is confirmed through a separate, known channel before it is acted on.',
    sources: ['bank 1.3 FS-D9-02']
  },
  'FS-D9-06': {
    title: 'A help desk reset hands an attacker the account that moves money',
    actor: 'An outsider impersonating an employee to the help desk or the IT provider.',
    opportunity: 'Password and multi-factor resets are made on the caller\'s word, and the systems that move money accept the reset account.',
    entryPoint: 'A call or message to the help desk asking for a password or multi-factor reset, often claiming a lost phone.',
    mechanism: 'The reset is made, the attacker signs in as the employee and uses the employee\'s access to change bank details or release payments.',
    controlRelied: 'Help desk resets are not verified through a route the caller does not control, and systems that move money are not protected by strong sign-in.',
    concealment: 'The activity is carried out under a real employee\'s account, so it looks like ordinary work.',
    consequence: 'Payments or changes made under a legitimate account, and the difficulty of proving who acted.',
    warningIndicators: ['A reset request claiming a lost phone or urgency', 'A reset followed quickly by payment or bank-detail activity', 'Sign-ins from an unusual location or device', 'An employee unaware of a reset made in their name'],
    containment: 'Lock the account, reverse the changes, contact the bank about any payment, and preserve the help desk and sign-in records.',
    longTerm: 'Every password or multi-factor reset is verified through a route the caller does not control, and systems that move money require strong sign-in.',
    sources: ['bank 1.3 FS-D9-06', 'MFRS mechanism account_takeover']
  }
};
