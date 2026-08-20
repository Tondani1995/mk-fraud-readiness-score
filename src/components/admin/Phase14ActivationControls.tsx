'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={
      notice.tone === 'error' ? 'mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700'
      : notice.tone === 'success' ? 'mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700'
      : 'mb-4 rounded-xl bg-mk-cream px-4 py-3 text-sm text-mk-ink'
    }>{notice.text}</p>
  );
}

type Gate = {
  status: string;
  required_version: number;
  satisfied_version: number;
  reason: string | null;
  updated_at: string;
} | null;

function Phase14GateControl({ gate }: { gate: Gate }) {
  const [reason, setReason] = useState('');
  const [targetVersion, setTargetVersion] = useState(String(gate?.required_version ?? 1));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(action: 'raise' | 'suspend') {
    if (!reason.trim()) {
      setNotice({ tone: 'error', text: 'A reason is required and is recorded in audit_logs.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/score/api/admin/phase14-activation/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          satisfiedVersion: action === 'raise' ? Number(targetVersion) : 0,
          reason
        })
      });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Gate update failed.');
      setNotice({ tone: 'success', text: `Gate updated: status is now ${result.gate?.status ?? 'unknown'}.` });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Gate update failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <NoticeBanner notice={notice} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge className={gate?.status === 'satisfied' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
          {gate?.status ?? 'unknown'}
        </Badge>
        <span className="text-sm text-mk-muted">
          satisfied_version {gate?.satisfied_version ?? '—'} / required_version {gate?.required_version ?? '—'}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <div>
          <label htmlFor="gate-version" className="text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">Version</label>
          <input
            id="gate-version"
            type="number"
            min={0}
            value={targetVersion}
            onChange={(event) => setTargetVersion(event.target.value)}
            className="mt-1 w-full rounded-xl border border-mk-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="gate-reason" className="text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">Reason (required, audited)</label>
          <input
            id="gate-reason"
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-xl border border-mk-line px-3 py-2 text-sm"
            placeholder="e.g. Security closure independently reviewed and approved 2026-07-17"
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" disabled={busy} onClick={() => submit('raise')}>
          {busy ? 'Updating…' : `Set satisfied_version = ${targetVersion}`}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => submit('suspend')}>
          Suspend gate (set to 0)
        </Button>
      </div>
    </div>
  );
}

type Policy = {
  policy_key: string;
  enabled: boolean;
  approved_gate_version: number | null;
  required_gate_version: number | null;
  reason: string | null;
};

function Phase14PoliciesControl({ policies, labels }: { policies: Policy[]; labels: Record<string, string> }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function toggle(policyKey: string, enabled: boolean) {
    const reason = reasons[policyKey]?.trim();
    if (!reason) {
      setNotice({ tone: 'error', text: 'Enter a reason for this policy before changing it.' });
      return;
    }
    setBusyKey(policyKey);
    setNotice(null);
    try {
      const response = await fetch('/score/api/admin/phase14-activation/feature-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policyKey, enabled, reason })
      });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Policy update failed.');
      setNotice({ tone: 'success', text: `${labels[policyKey] ?? policyKey} is now ${enabled ? 'enabled' : 'disabled'}.` });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Policy update failed.' });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <NoticeBanner notice={notice} />
      <ul className="space-y-3">
        {policies.map((policy) => (
          <li key={policy.policy_key} className="rounded-2xl border border-mk-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-mk-ink">{labels[policy.policy_key] ?? policy.policy_key}</p>
                <p className="text-xs text-mk-muted">
                  approved_gate_version {policy.approved_gate_version ?? '—'} / required_gate_version {policy.required_gate_version ?? '—'}
                </p>
              </div>
              <Badge className={policy.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-mk-cream text-mk-muted'}>
                {policy.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="text"
                value={reasons[policy.policy_key] ?? ''}
                onChange={(event) => setReasons((prev) => ({ ...prev, [policy.policy_key]: event.target.value }))}
                placeholder="Reason (required, audited)"
                className="min-w-[240px] flex-1 rounded-xl border border-mk-line px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant={policy.enabled ? 'secondary' : 'primary'}
                disabled={busyKey === policy.policy_key}
                onClick={() => toggle(policy.policy_key, !policy.enabled)}
              >
                {busyKey === policy.policy_key ? 'Working…' : policy.enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type AiRoute = { requested_provider: string; enabled: boolean; approved_gate_version: number | null };

function Phase14AiRoutesControl({ routes }: { routes: AiRoute[] }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function toggle(provider: string, enabled: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/score/api/admin/phase14-activation/ai-route-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, enabled })
      });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'AI route update failed.');
      setNotice({ tone: 'success', text: `${provider} route is now ${enabled ? 'enabled' : 'disabled'}.` });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'AI route update failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <NoticeBanner notice={notice} />
      <ul className="space-y-3">
        {routes.map((route) => (
          <li key={route.requested_provider} className="flex items-center justify-between rounded-2xl border border-mk-line bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-mk-ink">{route.requested_provider}</p>
              <p className="text-xs text-mk-muted">approved_gate_version {route.approved_gate_version ?? '—'}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={route.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-mk-cream text-mk-muted'}>
                {route.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Button type="button" variant={route.enabled ? 'secondary' : 'primary'} disabled={busy} onClick={() => toggle(route.requested_provider, !route.enabled)}>
                {route.enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Phase14SettingsControl({
  reportEngineSettings,
  deliveryPolicySettings
}: {
  reportEngineSettings: Record<string, unknown>;
  deliveryPolicySettings: Record<string, unknown>;
}) {
  const [reportEngine, setReportEngine] = useState(reportEngineSettings);
  const [deliveryPolicy, setDeliveryPolicy] = useState(deliveryPolicySettings);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function save(settingKey: string, valueJson: Record<string, unknown>) {
    setBusy(settingKey);
    setNotice(null);
    try {
      const response = await fetch('/score/api/admin/phase14-activation/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settingKey, valueJson })
      });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Settings update failed.');
      setNotice({ tone: 'success', text: `${settingKey} saved.` });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Settings update failed.' });
    } finally {
      setBusy(null);
    }
  }

  function bool(value: unknown) {
    return value === true;
  }

  return (
    <div className="space-y-6">
      <NoticeBanner notice={notice} />

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-mk-muted">phase14_autonomous_report_engine</h3>
        <div className="space-y-2 text-sm">
          {(['premium_report_auto_fulfilment_enabled', 'premium_report_ai_narrative_enabled', 'premium_report_auto_email_enabled'] as const).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bool(reportEngine[key])}
                onChange={(event) => setReportEngine((prev) => ({ ...prev, [key]: event.target.checked }))}
              />
              <code className="text-xs">{key}</code>
            </label>
          ))}
        </div>
        <Button type="button" className="mt-3" disabled={busy === 'phase14_autonomous_report_engine'} onClick={() => save('phase14_autonomous_report_engine', reportEngine)}>
          {busy === 'phase14_autonomous_report_engine' ? 'Saving…' : 'Save report-engine settings'}
        </Button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-mk-muted">phase14_delivery_policy</h3>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bool(deliveryPolicy.premium_report_manual_delivery_enabled)}
              onChange={(event) => setDeliveryPolicy((prev) => ({ ...prev, premium_report_manual_delivery_enabled: event.target.checked }))}
            />
            <code className="text-xs">premium_report_manual_delivery_enabled</code>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bool(deliveryPolicy.premium_report_test_recipient_override_enabled)}
              onChange={(event) => setDeliveryPolicy((prev) => ({ ...prev, premium_report_test_recipient_override_enabled: event.target.checked }))}
            />
            <code className="text-xs">premium_report_test_recipient_override_enabled</code>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-mk-muted">premium_report_test_recipient_override (email)</span>
            <input
              type="email"
              value={typeof reportEngine.premium_report_test_recipient_override === 'string' ? reportEngine.premium_report_test_recipient_override : ''}
              onChange={(event) => setReportEngine((prev) => ({ ...prev, premium_report_test_recipient_override: event.target.value || null }))}
              placeholder="internal-test@mkfraud.co.za"
              className="rounded-xl border border-mk-line px-3 py-2 text-sm"
            />
          </div>
        </div>
        <Button type="button" className="mt-3" disabled={busy === 'phase14_delivery_policy'} onClick={() => save('phase14_delivery_policy', deliveryPolicy)}>
          {busy === 'phase14_delivery_policy' ? 'Saving…' : 'Save delivery-policy settings'}
        </Button>
        <p className="mt-2 text-xs text-mk-muted">
          The test-recipient override email address lives under phase14_autonomous_report_engine (premium_report_test_recipient_override)
          and is saved together with the report-engine settings above.
        </p>
      </div>
    </div>
  );
}

const RUNTIME_SECRET_MIN_LENGTH = 32;
const RUNTIME_SECRET_GENERATED_BYTES = 48;

// URL/shell-safe base64 (no '+', '/', '=') so the generated value can be pasted directly into a
// Vercel env var or a shell without escaping. Uses Web Crypto's CSPRNG, not Math.random.
function generateHighEntropySecret(byteLength = RUNTIME_SECRET_GENERATED_BYTES): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Computed entirely client-side via Web Crypto SubtleCrypto -- never sent anywhere. Used only to
// let the admin visually confirm, after submission, that the value the server fingerprinted is
// the exact same value they generated and pasted into Vercel (both are the identical string, so
// both fingerprints are computed from that one string, one locally and one in Postgres).
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

type RuntimeSecretResult = { secret_key: string; rotated_at: string; fingerprint: string } | null;

function Phase14RuntimeSecretControl({
  secretKey,
  vercelVarName,
  description
}: {
  secretKey: 'provider_webhook_db_hmac' | 'provider_lookup_db_hmac';
  vercelVarName: string;
  description: string;
}) {
  const [secretValue, setSecretValue] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [reason, setReason] = useState('');
  const [reveal, setReveal] = useState(false);
  const [clientFingerprint, setClientFingerprint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [result, setResult] = useState<RuntimeSecretResult>(null);

  function handleGenerate() {
    const generated = generateHighEntropySecret();
    setSecretValue(generated);
    setConfirmValue(generated);
    setResult(null);
    setNotice(null);
    sha256Hex(generated).then(setClientFingerprint).catch(() => setClientFingerprint(null));
  }

  function handleSecretValueChange(value: string) {
    setSecretValue(value);
    setResult(null);
    if (value.length >= RUNTIME_SECRET_MIN_LENGTH) {
      sha256Hex(value).then(setClientFingerprint).catch(() => setClientFingerprint(null));
    } else {
      setClientFingerprint(null);
    }
  }

  async function submit() {
    if (!reason.trim()) {
      setNotice({ tone: 'error', text: 'A reason is required and is recorded in audit_logs.' });
      return;
    }
    if (secretValue.length < RUNTIME_SECRET_MIN_LENGTH) {
      setNotice({ tone: 'error', text: `The secret value must be at least ${RUNTIME_SECRET_MIN_LENGTH} characters.` });
      return;
    }
    if (secretValue !== confirmValue) {
      setNotice({ tone: 'error', text: 'The secret value and confirmation do not match.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/score/api/admin/phase14-activation/runtime-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretKey, secretValue, confirmValue, reason })
      });
      const body = await readJson(response);
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'Secret rotation failed.');
      setResult(body.secret as RuntimeSecretResult);
      setNotice({ tone: 'success', text: `${secretKey} rotated. The value has been cleared from this form.` });
      // Clear the secret from memory immediately on success -- never left sitting in state.
      setSecretValue('');
      setConfirmValue('');
      setReason('');
      setReveal(false);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Secret rotation failed.' });
    } finally {
      setBusy(false);
    }
  }

  const fingerprintsMatch = result && clientFingerprint ? result.fingerprint === clientFingerprint : null;

  return (
    <div className="rounded-2xl border border-mk-line bg-white p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-mk-ink">Supabase secret <code>{secretKey}</code></p>
        <p className="text-xs text-mk-muted">Paired Vercel Preview variable: <code>{vercelVarName}</code> · {description}</p>
      </div>
      <NoticeBanner notice={notice} />

      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={handleGenerate}>
          Generate a new {RUNTIME_SECRET_GENERATED_BYTES}-byte secret
        </Button>
        {clientFingerprint && (
          <span className="self-center text-xs text-mk-muted">
            Client-computed SHA-256: <code>{clientFingerprint.slice(0, 16)}…</code>
          </span>
        )}
      </div>

      <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-mk-muted">
        <li>Generate here, or paste an equally high-entropy value of your own.</li>
        <li>Copy the exact value into Vercel → Project Settings → Environment Variables → <code>{vercelVarName}</code>, scoped to <strong>Preview</strong> on <code>release-c/email-secure-delivery</code> only.</li>
        <li>Submit the identical value below to provision the matching Supabase secret.</li>
        <li>Compare the fingerprint shown after submission against the client-computed one above — they must match, since both are SHA-256 of the one value you just pasted in both places.</li>
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${secretKey}-value`} className="text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">
            Secret value
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={`${secretKey}-value`}
              type={reveal ? 'text' : 'password'}
              autoComplete="off"
              value={secretValue}
              onChange={(event) => handleSecretValueChange(event.target.value)}
              className="w-full rounded-xl border border-mk-line px-3 py-2 text-sm font-mono"
              placeholder="At least 32 random characters"
            />
            <Button type="button" variant="ghost" onClick={() => setReveal((v) => !v)}>
              {reveal ? 'Hide' : 'Reveal'}
            </Button>
          </div>
        </div>
        <div>
          <label htmlFor={`${secretKey}-confirm`} className="text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">
            Confirm secret value
          </label>
          <input
            id={`${secretKey}-confirm`}
            type={reveal ? 'text' : 'password'}
            autoComplete="off"
            value={confirmValue}
            onChange={(event) => setConfirmValue(event.target.value)}
            className="mt-1 w-full rounded-xl border border-mk-line px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={`${secretKey}-reason`} className="text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">
          Reason (required, audited)
        </label>
        <input
          id={`${secretKey}-reason`}
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 w-full rounded-xl border border-mk-line px-3 py-2 text-sm"
          placeholder="e.g. Initial provisioning for Release C controlled Preview verification, 2026-07-25"
        />
      </div>

      <div className="mt-4">
        <Button type="button" disabled={busy} onClick={submit}>
          {busy ? 'Provisioning…' : `Provision ${secretKey}`}
        </Button>
      </div>

      {result && (
        <div className="mt-4 rounded-xl bg-mk-cream px-4 py-3 text-xs text-mk-ink">
          <p><strong>Secret key:</strong> {result.secret_key}</p>
          <p><strong>Rotated at:</strong> {result.rotated_at}</p>
          <p><strong>Fingerprint (SHA-256, not the secret):</strong> <code>{result.fingerprint}</code></p>
          {fingerprintsMatch !== null && (
            <p className={fingerprintsMatch ? 'text-emerald-700' : 'text-red-700'}>
              {fingerprintsMatch
                ? 'Matches the client-computed fingerprint of the value you generated above.'
                : 'Does NOT match the client-computed fingerprint — do not assume Vercel has the same value.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export {
  Phase14GateControl,
  Phase14PoliciesControl,
  Phase14AiRoutesControl,
  Phase14SettingsControl,
  Phase14RuntimeSecretControl
};
