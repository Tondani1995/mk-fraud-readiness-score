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

export { Phase14GateControl, Phase14PoliciesControl, Phase14AiRoutesControl, Phase14SettingsControl };
