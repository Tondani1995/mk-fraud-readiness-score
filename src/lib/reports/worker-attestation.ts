import crypto from 'node:crypto';

export type WorkerAttestationBindings = {
  capabilityId: string;
  capabilityType: string;
  operationKey: string;
  executionId: string;
  expectedStep: string;
  leaseGeneration: number;
  authorityEpoch: number;
  orderId?: string | null;
  assessmentId?: string | null;
  scoreRunId?: string | null;
  fulfilmentId?: string | null;
  reportId?: string | null;
  recipient?: string | null;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

export function canonicalWorkerPayload(payload: Record<string, unknown>) {
  return JSON.stringify(stableValue(payload));
}

function workerAttestationSecret() {
  const keyId = process.env.PHASE14_WORKER_ATTESTATION_KEY_ID?.trim();
  const secret = process.env.PHASE14_WORKER_ATTESTATION_SECRET?.trim();
  if (!keyId || !/^[a-zA-Z0-9._:-]{1,80}$/.test(keyId) || !secret || secret.length < 32) {
    throw new Error('phase14_worker_attestation_not_configured');
  }
  return { keyId, secret };
}

export function createWorkerAttestation(input: {
  lease: WorkerAttestationBindings;
  action: string;
  payload: Record<string, unknown>;
  reportId?: string | null;
  recipient?: string | null;
}) {
  const { keyId, secret } = workerAttestationSecret();
  const requestPayload = canonicalWorkerPayload(input.payload);
  const issuedAtEpoch = Math.floor(Date.now() / 1000);
  const attestation = {
    key_id: keyId,
    capability_id: input.lease.capabilityId,
    capability_type: input.lease.capabilityType,
    operation_key: input.lease.operationKey,
    execution_id: input.lease.executionId,
    action: input.action,
    step: input.lease.expectedStep,
    order_id: input.lease.orderId ?? '',
    assessment_id: input.lease.assessmentId ?? '',
    score_run_id: input.lease.scoreRunId ?? '',
    fulfilment_id: input.lease.fulfilmentId ?? '',
    report_id: input.reportId ?? input.lease.reportId ?? '',
    recipient: (input.recipient ?? input.lease.recipient ?? '').trim().toLowerCase(),
    lease_generation: String(input.lease.leaseGeneration),
    request_payload_hash: crypto.createHash('sha256').update(requestPayload).digest('hex'),
    issued_at_epoch: String(issuedAtEpoch),
    expires_at_epoch: String(issuedAtEpoch + 60),
    nonce: crypto.randomUUID(),
    authority_epoch: String(input.lease.authorityEpoch)
  };
  const canonical = [
    attestation.key_id,
    attestation.capability_id,
    attestation.capability_type,
    attestation.operation_key,
    attestation.execution_id,
    attestation.action,
    attestation.step,
    attestation.order_id,
    attestation.assessment_id,
    attestation.score_run_id,
    attestation.fulfilment_id,
    attestation.report_id,
    attestation.recipient,
    attestation.lease_generation,
    attestation.request_payload_hash,
    attestation.issued_at_epoch,
    attestation.expires_at_epoch,
    attestation.nonce,
    attestation.authority_epoch
  ].join('|');
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return { attestation, signature, requestPayload };
}
