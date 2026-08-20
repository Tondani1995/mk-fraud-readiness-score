import fs from 'node:fs/promises';
import path from 'node:path';
import type { NarrativeGenerationDiagnosticsSink } from './orchestrator';

export interface NarrativeOwnerReviewDiagnosticsOptions {
  rootDirectory: string;
  caseDirectory: string;
  attemptPrefix?: string;
}

function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/(AI_GATEWAY_API_KEY|OPENAI_API_KEY|VERCEL_AI_GATEWAY_API_KEY)\s*=\s*[^\s,;]+/gi, '$1=<REDACTED>')
      .replace(/\b(?:sk|pk|rk)[_-](?:live|test)[_-][A-Za-z0-9]{16,}\b/g, '<REDACTED_VENDOR_KEY>')
      .replace(/\bsk-[A-Za-z0-9]{20,}\b/g, '<REDACTED_VENDOR_KEY>')
      .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<REDACTED_TOKEN>');
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactSecrets(child)]));
  return value;
}

function sanitisedTokenCount(candidate: unknown): number | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const metadata = (candidate as { writerMetadata?: { presentationSanitisedProvenanceTokenCount?: unknown } }).writerMetadata;
  const count = metadata?.presentationSanitisedProvenanceTokenCount;
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : null;
}

/**
 * Explicitly opt-in sink for owner-review/certification runs. Production callers do not persist
 * rejected AI candidates unless they pass this sink deliberately. Files are internal diagnostics,
 * not customer deliverables, and the serialised content is secret-redacted before writing.
 */
export function createNarrativeOwnerReviewDiagnosticsSink(options: NarrativeOwnerReviewDiagnosticsOptions): NarrativeGenerationDiagnosticsSink {
  const prefix = options.attemptPrefix ?? `${options.caseDirectory}-attempt`;
  let attempt = 0;
  return {
    async onRejectedCandidate(input) {
      attempt += 1;
      const directory = path.join(options.rootDirectory, 'failed-attempts', `${prefix}-${String(attempt).padStart(2, '0')}`);
      await fs.mkdir(directory, { recursive: true });
      const candidate = redactSecrets(input.candidate);
      const validation = redactSecrets({ narrativeValidation: input.narrativeValidation, editorialValidation: input.editorialValidation ?? null });
      const metadata = candidate && typeof candidate === 'object' && 'writerMetadata' in candidate
        ? redactSecrets((candidate as { writerMetadata?: unknown }).writerMetadata)
        : null;
      await fs.writeFile(path.join(directory, 'generated-structured-candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`);
      if (input.plainText) await fs.writeFile(path.join(directory, 'customer-text.md'), `${String(redactSecrets(input.plainText)).trim()}\n`);
      await fs.writeFile(path.join(directory, 'validation-report.json'), `${JSON.stringify(validation, null, 2)}\n`);
      await fs.writeFile(path.join(directory, 'failed-paths.json'), `${JSON.stringify({ stage: input.stage, paths: input.narrativeValidation.issues.map((issue) => issue.path) }, null, 2)}\n`);
      await fs.writeFile(path.join(directory, 'diagnostic-metadata.json'), `${JSON.stringify({ stage: input.stage, sanitisedProvenanceTokenCount: sanitisedTokenCount(input.candidate), writerMetadata: metadata, persistedFor: 'owner-review/certification only', customerDeliverable: false, pdf: false, apiKeysPersisted: false }, null, 2)}\n`);
    }
  };
}
