# P06 Nimbus — scenario projection (deterministic, zero provider)

Source: Fact Pack scenario projection, shared with Essential.

## Supplier or payment instruction is diverted through a compromised or fictitious relationship

- **Family:** SUPPLIER PAYMENT DIVERSION
- **How it could begin:** A supplier or bank-detail amendment is submitted shortly before a scheduled payment.
- **How it could progress:** An actor submits a credible-looking bank-detail change and diverts a genuine payment before the change is independently challenged.
- **Interruption point:** Procurement performs a pre-activation checklist across every proposed supplier, independently verifies registration and bank ownership, screens beneficial owners and conflicts, risk-rates the supplier, and blocks ERP activation until a second reviewer signs; the vendor master retains the evidence package.; Accounts Payable quarantines every bank-detail change, retrieves a contact from the pre-change vendor master, completes and records an outbound callback, obtains second-person approval from someone outside vendor-master maintenance, blocks payment until verification, and gives the CFO a monthly report of all changes, failures and bypass attempts.
- **Warning indicators:**
  - New or reactivated supplier before independent verification
  - Bank-detail change shortly before payment
  - Urgent payment request that bypasses the normal callback route
- **Traceability:** findings FINDING-002, FINDING-005 · risks RISK-007, RISK-008 · controls —

## Records or reporting are weakened after a suspected fraud matter, allowing exposure to repeat

- **Family:** INCIDENT CONCEALMENT
- **How it could begin:** A suspected matter generates records before a retention, legal-hold or custody decision is made.
- **How it could progress:** An actor delays, alters or fragments relevant records so that the scope, timing or responsibility for the suspected matter becomes harder to establish.
- **Interruption point:** The incident-response lead maintains a version-controlled plan covering every reported fraud incident, names an incident commander and deputies, classifies severity at intake, convenes Legal/HR/IT/Finance roles, records decisions and containment actions, and runs an annual tabletop with tracked remediation.
- **Warning indicators:**
  - Concern is reported through a channel controlled by the implicated process
  - Relevant records are unavailable or custody is unclear
  - Severity or containment decision remains overdue
- **Traceability:** findings FINDING-004 · risks RISK-006 · controls —

