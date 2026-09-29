import { createHash } from 'node:crypto';
import { sanitiseCampaignAttribution } from '@/lib/website/acquisition-context';
import { recordPublicEnquiryAudit } from '@/lib/enquiries/public-enquiry-service';

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicUuid(hash: string) {
  const chars = hash.slice(0, 32).split('');
  chars[12] = '5';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function recordCalendlyCommercialEvent(
  input: { eventUri: string | null; inviteeUri: string | null; attribution: unknown },
  dependencies: { db?: any } = {},
): Promise<'recorded' | 'already_recorded'> {
  const eventHash = input.eventUri ? digest(input.eventUri) : null;
  const inviteeHash = input.inviteeUri ? digest(input.inviteeUri) : null;
  const dedupeKeyHash = digest(`${input.eventUri ?? ''}|${input.inviteeUri ?? ''}`);
  const ledgerId = deterministicUuid(dedupeKeyHash);
  const result = await recordPublicEnquiryAudit({
    commercialEvent: {
      id: ledgerId,
      action: 'service_consultation_booked',
      afterJson: {
        source: 'calendly_parent_event',
        dedupe_key_hash: dedupeKeyHash,
        provider_event_hash: eventHash,
        provider_invitee_hash: inviteeHash,
        attribution: sanitiseCampaignAttribution(input.attribution),
        contains_pii: false,
      },
    },
  }, dependencies);
  return result as 'recorded' | 'already_recorded';
}
