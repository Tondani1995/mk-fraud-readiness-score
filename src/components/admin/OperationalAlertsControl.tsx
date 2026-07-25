'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { OperationalAlertStatus } from '@/lib/reports/operational-alerts';

const NEXT_ACTIONS: Record<OperationalAlertStatus, { target: OperationalAlertStatus; label: string }[]> = {
  open: [
    { target: 'acknowledged', label: 'Acknowledge' },
    { target: 'resolved', label: 'Resolve' }
  ],
  acknowledged: [
    { target: 'resolved', label: 'Resolve' },
    { target: 'open', label: 'Reopen' }
  ],
  resolved: [
    { target: 'open', label: 'Reopen' }
  ]
};

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export function OperationalAlertActions({ alertId, status }: { alertId: string; status: OperationalAlertStatus }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pendingTarget, setPendingTarget] = useState<OperationalAlertStatus | null>(null);

  async function submit(target: OperationalAlertStatus) {
    if (!reason.trim()) {
      setNotice({ tone: 'error', text: 'A reason is required and is recorded in audit_logs.' });
      setPendingTarget(target);
      return;
    }
    setBusy(target);
    setNotice(null);
    try {
      const response = await fetch(`/score/api/admin/operational-alerts/${alertId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStatus: target, reason })
      });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Transition failed.');
      setNotice({ tone: 'success', text: `Alert is now ${target}.` });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Transition failed.' });
    } finally {
      setBusy(null);
    }
  }

  const actions = NEXT_ACTIONS[status] ?? [];

  return (
    <div className="w-full max-w-xs shrink-0 sm:w-64">
      {notice && (
        <p className={notice.tone === 'error' ? 'mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700' : 'mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700'}>
          {notice.text}
        </p>
      )}
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (required, audited)"
        className="mb-2 w-full rounded-xl border border-mk-line px-3 py-2 text-xs"
      />
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.target}
            type="button"
            variant={action.target === 'resolved' ? 'primary' : 'secondary'}
            disabled={busy !== null}
            onClick={() => submit(action.target)}
          >
            {busy === action.target ? 'Working…' : action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
