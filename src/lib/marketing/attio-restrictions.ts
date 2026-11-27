import { emailDomain, isPersonalMailboxDomain } from '@/lib/marketing/email-address';
import type { RestrictionDecision } from '@/lib/marketing/subscription-state';

/**
 * Organisation-restriction screen for MK Fraud Signals, read live from Attio.
 *
 * Attio stays the single source of truth for restrictions. Nothing is copied into this repository
 * or into Supabase except the decision and the record IDs that produced it, so a restriction that
 * ChatGPT adds in Attio applies at the next check without a deployment.
 *
 * Two registers are combined, never assumed identical:
 *   - MK | Restricted Organisations (every entry restricts, whatever its Restriction value);
 *   - MK | Commercial register entries whose relationship status is one of the configured
 *     exclusion statuses (MK_ATTIO_EXCLUSION_STATUSES, default "Excluded").
 * A subscriber is screened by (a) an Attio person record holding the exact address and every
 * company that person is linked to, and (b) every Attio company whose domains include the
 * address's domain (aliases and associated domains are matched because Attio stores them all).
 *
 * Fail-closed outcomes:
 *   restricted: any match against either register;
 *   ambiguous: the address matches more than one person, or the domain matches more than one
 *                 company and the companies disagree, or a person is linked to a restricted
 *                 company and an unrestricted one;
 *   unchecked: Attio is unreachable, the token is missing, or a response is malformed.
 * Only "clear" allows distribution. The screen never writes to Attio.
 */

export type AttioRestrictionConfig = {
  token: string;
  restrictedListId: string;
  commercialRegisterListId: string;
  exclusionStatusAttribute: string;
  exclusionStatuses: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type RestrictionResult = {
  decision: RestrictionDecision;
  evidence: {
    personRecordIds: string[];
    matchedCompanyRecordIds: string[];
    restrictedRecordIds: string[];
    domainChecked: string | null;
    personalMailbox: boolean;
    detail: string;
  };
};

const ATTIO_API = 'https://api.attio.com/v2';

type AttioRecord = {
  id?: { record_id?: string };
  values?: Record<string, Array<Record<string, unknown>>>;
};

type AttioEntry = {
  parent_record_id?: string;
  parent_object?: string;
};

async function attioPost<T>(config: AttioRestrictionConfig, path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 6000);
  try {
    const response = await (config.fetchImpl ?? fetch)(`${ATTIO_API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`attio_${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

async function listAllEntryParents(config: AttioRestrictionConfig, listId: string, filter: unknown | null): Promise<Set<string>> {
  const parents = new Set<string>();
  let offset = 0;
  // Registers are small (hundreds); cap the walk so a runaway response cannot loop forever.
  for (let page = 0; page < 20; page += 1) {
    const body: Record<string, unknown> = { limit: 500, offset };
    if (filter) body.filter = filter;
    const result = await attioPost<{ data?: AttioEntry[] }>(config, `/lists/${encodeURIComponent(listId)}/entries/query`, body);
    if (!Array.isArray(result.data)) throw new Error('attio_entries_malformed');
    for (const entry of result.data) {
      if (typeof entry.parent_record_id === 'string') parents.add(entry.parent_record_id);
    }
    if (result.data.length < 500) return parents;
    offset += 500;
  }
  throw new Error('attio_entries_page_limit');
}

function recordId(record: AttioRecord): string | null {
  return typeof record.id?.record_id === 'string' ? record.id.record_id : null;
}

function linkedCompanyIds(person: AttioRecord): string[] {
  const values = person.values?.company ?? [];
  return values
    .map((value) => (typeof value.target_record_id === 'string' ? value.target_record_id : null))
    .filter((value): value is string => Boolean(value));
}

let restrictedIndexCache: { at: number; key: string; ids: Set<string> } | null = null;
const INDEX_TTL_MS = 5 * 60 * 1000;

/** Union of both registers' parent record IDs (companies or people). */
export async function loadRestrictedRecordIds(config: AttioRestrictionConfig, now = Date.now()): Promise<Set<string>> {
  const key = `${config.restrictedListId}|${config.commercialRegisterListId}|${config.exclusionStatuses.join(',')}`;
  if (restrictedIndexCache && restrictedIndexCache.key === key && now - restrictedIndexCache.at < INDEX_TTL_MS) {
    return restrictedIndexCache.ids;
  }
  const restricted = await listAllEntryParents(config, config.restrictedListId, null);
  const excluded = config.exclusionStatuses.length
    ? await listAllEntryParents(config, config.commercialRegisterListId, {
        $or: config.exclusionStatuses.map((status) => ({ [config.exclusionStatusAttribute]: { status: { $eq: status } } }))
      })
    : new Set<string>();
  const ids = new Set<string>([...restricted, ...excluded]);
  restrictedIndexCache = { at: now, key, ids };
  return ids;
}

export function resetRestrictionCacheForTests() {
  restrictedIndexCache = null;
}

export async function screenSubscriberAgainstAttio(email: string, config: AttioRestrictionConfig | null): Promise<RestrictionResult> {
  const domain = emailDomain(email);
  const personalMailbox = isPersonalMailboxDomain(domain);
  const base = { personRecordIds: [] as string[], matchedCompanyRecordIds: [] as string[], restrictedRecordIds: [] as string[], domainChecked: personalMailbox ? null : domain, personalMailbox };

  if (!config || !config.token || !config.restrictedListId || !config.commercialRegisterListId) {
    return { decision: 'unchecked', evidence: { ...base, detail: 'attio_not_configured' } };
  }

  try {
    const restricted = await loadRestrictedRecordIds(config);

    const people = await attioPost<{ data?: AttioRecord[] }>(config, '/objects/people/records/query', {
      filter: { email_addresses: email },
      limit: 5
    });
    if (!Array.isArray(people.data)) throw new Error('attio_people_malformed');
    const personIds = people.data.map(recordId).filter((value): value is string => Boolean(value));
    const personCompanyIds = people.data.flatMap(linkedCompanyIds);

    let domainCompanyIds: string[] = [];
    if (!personalMailbox) {
      const companies = await attioPost<{ data?: AttioRecord[] }>(config, '/objects/companies/records/query', {
        filter: { domains: { domain: { $eq: domain } } },
        limit: 10
      });
      if (!Array.isArray(companies.data)) throw new Error('attio_companies_malformed');
      domainCompanyIds = companies.data.map(recordId).filter((value): value is string => Boolean(value));
    }

    const candidateIds = [...new Set([...personIds, ...personCompanyIds, ...domainCompanyIds])];
    const hits = candidateIds.filter((id) => restricted.has(id));
    const evidence = {
      ...base,
      personRecordIds: personIds,
      matchedCompanyRecordIds: [...new Set([...personCompanyIds, ...domainCompanyIds])],
      restrictedRecordIds: hits
    };

    if (personIds.length > 1) {
      return { decision: 'ambiguous', evidence: { ...evidence, detail: 'address_matches_multiple_people' } };
    }
    if (hits.length > 0) {
      const mixed = evidence.matchedCompanyRecordIds.some((id) => !restricted.has(id));
      return { decision: 'restricted', evidence: { ...evidence, detail: mixed ? 'restricted_with_mixed_associations' : 'restricted_match' } };
    }
    if (domainCompanyIds.length > 1) {
      return { decision: 'ambiguous', evidence: { ...evidence, detail: 'domain_matches_multiple_companies' } };
    }
    return { decision: 'clear', evidence: { ...evidence, detail: candidateIds.length ? 'matched_unrestricted' : 'no_attio_match' } };
  } catch (error) {
    return {
      decision: 'unchecked',
      evidence: { ...base, detail: error instanceof Error ? error.message.slice(0, 80) : 'attio_error' }
    };
  }
}

export function attioRestrictionConfigFromEnv(): AttioRestrictionConfig | null {
  const token = process.env.MK_ATTIO_RESTRICTION_READ_TOKEN?.trim();
  const restrictedListId = process.env.MK_ATTIO_RESTRICTED_LIST_ID?.trim();
  const commercialRegisterListId = process.env.MK_ATTIO_COMMERCIAL_REGISTER_LIST_ID?.trim();
  if (!token || !restrictedListId || !commercialRegisterListId) return null;
  return {
    token,
    restrictedListId,
    commercialRegisterListId,
    exclusionStatusAttribute: process.env.MK_ATTIO_EXCLUSION_STATUS_ATTRIBUTE?.trim() || 'relationship_status',
    exclusionStatuses: (process.env.MK_ATTIO_EXCLUSION_STATUSES ?? 'Excluded').split(',').map((value) => value.trim()).filter(Boolean)
  };
}
