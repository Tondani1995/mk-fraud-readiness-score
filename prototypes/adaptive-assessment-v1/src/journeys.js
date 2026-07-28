/**
 * Six synthetic organisation journeys.
 *
 * PROTOTYPE ONLY — entirely fabricated. No real customer, organisation or personal
 * data appears here, and none is collected by the prototype.
 *
 * Each journey supplies gateway answers only. The methodology answers are generated
 * by a deterministic responder profile so journeys are reproducible in tests.
 */

export const JOURNEYS = [
  {
    id: 'J1',
    name: 'Professional-services firm',
    blurb: 'No stock, no cash, limited suppliers, outsourced payroll, office-based.',
    organisationName: 'Meridian Advisory (synthetic)',
    gateways: {
      G01: 'professional_services',
      G02: 'small',
      G03: 'internal',
      G04: 'owner_led',
      G05: 'none',
      G06: 'no',
      G07: 'outsourced',
      G08: 'yes',
      G09: 'yes',
      G10: 'no',
      G11: 'no',
      G12: 'no',
      G13: 'yes',
      G14: 'formal_delegation'
    },
    responder: 'moderate'
  },
  {
    id: 'J2',
    name: 'Retail organisation',
    blurb: 'Multiple stores, cash, card payments, inventory, refunds, temporary staff.',
    organisationName: 'Kopano Retail Group (synthetic)',
    gateways: {
      G01: 'retail',
      G02: 'medium',
      G03: 'internal',
      G04: 'internal_department',
      G05: 'significant',
      G06: 'yes',
      G07: 'internal',
      G08: 'yes',
      G09: 'yes',
      G10: 'yes',
      G11: 'yes',
      G12: 'yes',
      G13: 'yes',
      G14: 'formal_delegation'
    },
    responder: 'mixed'
  },
  {
    id: 'J3',
    name: 'Construction business',
    blurb: 'Subcontractors, procurement, project sites, plant, invoice and variation exposure.',
    organisationName: 'Sentinel Civils (synthetic)',
    gateways: {
      G01: 'construction',
      G02: 'medium',
      G03: 'internal',
      G04: 'internal_department',
      G05: 'minor',
      G06: 'yes',
      G07: 'internal',
      G08: 'no',
      G09: 'yes',
      G10: 'yes',
      G11: 'yes',
      G12: 'yes',
      G13: 'no',
      G14: 'formal_delegation'
    },
    responder: 'weak'
  },
  {
    id: 'J4',
    name: 'Online business',
    blurb: 'Online sales, digital payments, customer data, remote staff, third-party platforms.',
    organisationName: 'Nandi Digital (synthetic)',
    gateways: {
      G01: 'online',
      G02: 'small',
      G03: 'outsourced',
      G04: 'outsourced',
      G05: 'none',
      G06: 'no',
      G07: 'outsourced',
      G08: 'platform',
      G09: 'yes',
      G10: 'yes',
      G11: 'no',
      G12: 'no',
      G13: 'yes',
      G14: 'owner_led'
    },
    responder: 'moderate'
  },
  {
    id: 'J5',
    name: 'Small business, simple operations',
    blurb: 'No procurement department, no payroll department, few employees, owner-led approvals.',
    organisationName: 'Tumelo Studio (synthetic)',
    gateways: {
      G01: 'professional_services',
      G02: 'micro',
      G03: 'none',
      G05: 'minor',
      G06: 'no',
      G07: 'none',
      G08: 'no',
      G09: 'yes',
      G10: 'no',
      G11: 'no',
      G12: 'no',
      G13: 'no',
      G14: 'owner_led'
    },
    responder: 'weak'
  },
  {
    id: 'J6',
    name: 'Low-certainty respondent',
    blurb: 'Frequent "I do not know", incomplete understanding, attempts to shorten via non-applicability.',
    organisationName: 'Unnamed Holdings (synthetic)',
    gateways: {
      G01: 'other',
      G02: 'unknown',
      G03: 'unknown',
      G04: 'unknown',
      G05: 'unknown',
      G06: 'unknown',
      G07: 'unknown',
      G08: 'unknown',
      G09: 'unknown',
      G10: 'unknown',
      G11: 'unknown',
      G12: 'unknown',
      G13: 'unknown',
      G14: 'unknown'
    },
    responder: 'uncertain'
  }
];

/**
 * Deterministic responder profiles. Given a question id, return a maturity answer.
 * Uses a stable hash of the question id so runs are reproducible without a RNG seed.
 */
function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

export const RESPONDERS = {
  weak: (qid) => [0, 1, 1, 2, 0, 2][stableHash(qid) % 6],
  moderate: (qid) => [2, 3, 3, 4, 2, 3][stableHash(qid) % 6],
  mixed: (qid) => [1, 4, 2, 5, 0, 3][stableHash(qid) % 6],
  strong: (qid) => [4, 5, 4, 5, 3, 4][stableHash(qid) % 6],
  // Answers "I do not know" for two out of every three questions.
  uncertain: (qid) => (stableHash(qid) % 3 === 0 ? [1, 2, 0][stableHash(qid) % 3] : 'unknown')
};

export function getJourney(id) {
  return JOURNEYS.find((j) => j.id === id) || null;
}

/** Build a complete answer state for a journey by walking the active path. */
export function runJourney(graph, journey) {
  const answers = {};
  const auditHistory = [];

  // Phase 1: gateway answers from the journey definition.
  for (const g of graph.gateways) {
    const value = journey.gateways[g.question_id];
    if (value === undefined) continue;
    answers[g.question_id] = { value, answeredAt: 'synthetic' };
  }

  // Phase 2: walk the active path, answering every methodology node.
  const responder = RESPONDERS[journey.responder];
  let guard = 0;
  for (;;) {
    guard += 1;
    if (guard > 500) throw new Error(`Journey ${journey.id} did not terminate (possible loop)`);
    const next = graph.nextUnanswered(answers);
    if (!next) break;
    if (next.node.gateway_status === 'gateway') {
      // A gateway became applicable but the journey did not define it — record uncertainty
      // rather than silently inventing a convenient answer.
      answers[next.id] = { value: 'unknown', answeredAt: 'synthetic' };
      continue;
    }
    answers[next.id] = { value: responder(next.id), answeredAt: 'synthetic' };
  }

  return { answers, auditHistory, iterations: guard };
}
