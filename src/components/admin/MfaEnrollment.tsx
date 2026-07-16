'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Factor = {
  id: string;
  factorType: string;
  friendlyName: string | null;
  status: 'verified' | 'unverified';
  createdAt: string;
};

type AalStatus = {
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  hasVerifiedFactor: boolean;
};

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export function MfaEnrollment() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [aal, setAal] = useState<AalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/score/api/admin/mfa/factors', { cache: 'no-store' });
      const result = await readJson(response);
      if (response.ok && result.ok) {
        setFactors(result.factors ?? []);
        setAal(result.aal ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function startEnrollment() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/score/api/admin/mfa/enroll', { method: 'POST' });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Could not start enrollment.');
      setPendingFactorId(result.factorId);
      setQrCodeSvg(result.qrCodeSvg);
      setSecret(result.secret);
      setEnrolling(true);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not start enrollment.' });
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!pendingFactorId || !/^[0-9]{6}$/.test(code)) {
      setNotice({ tone: 'error', text: 'Enter the 6-digit code from your authenticator app.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/score/api/admin/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factorId: pendingFactorId, code })
      });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Invalid code.');
      setNotice({ tone: 'success', text: 'Authenticator app verified. You are now signed in at AAL2.' });
      setEnrolling(false);
      setQrCodeSvg(null);
      setSecret(null);
      setCode('');
      setPendingFactorId(null);
      await refresh();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Invalid code.' });
    } finally {
      setBusy(false);
    }
  }

  async function stepUp(factorId: string) {
    setBusy(true);
    setNotice(null);
    setPendingFactorId(factorId);
    setEnrolling(true);
    setNotice({ tone: 'info', text: 'Enter a fresh code from your authenticator app to step up to AAL2.' });
    setBusy(false);
  }

  async function removeFactor(factorId: string) {
    if (!window.confirm('Remove this authenticator? You will lose AAL2 access until you enroll a new one.')) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/score/api/admin/mfa/unenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factorId })
      });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Could not remove factor.');
      setNotice({ tone: 'success', text: 'Authenticator removed.' });
      await refresh();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not remove factor.' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-mk-muted">Loading security status…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-mk-ink">Current session level:</span>
        <Badge className={aal?.currentLevel === 'aal2' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
          {aal?.currentLevel === 'aal2' ? 'AAL2 (MFA verified)' : 'AAL1 (password only)'}
        </Badge>
        {aal?.currentLevel !== 'aal2' && aal?.hasVerifiedFactor ? (
          <span className="text-xs text-mk-muted">You have a verified authenticator — enter a fresh code below to step up.</span>
        ) : null}
      </div>

      {notice ? (
        <p className={
          notice.tone === 'error' ? 'rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700'
          : notice.tone === 'success' ? 'rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700'
          : 'rounded-xl bg-mk-cream px-4 py-3 text-sm text-mk-ink'
        }>{notice.text}</p>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-mk-muted">Authenticator apps</h3>
        {factors.length === 0 ? (
          <p className="text-sm text-mk-muted">No authenticator enrolled yet. Security-gate and Phase 14 activation actions require AAL2 and will be unavailable until one is enrolled and verified.</p>
        ) : (
          <ul className="space-y-2">
            {factors.map((factor) => (
              <li key={factor.id} className="flex items-center justify-between rounded-2xl border border-mk-line bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-mk-ink">{factor.friendlyName ?? factor.factorType}</p>
                  <p className="text-xs text-mk-muted">
                    {factor.status === 'verified' ? 'Verified' : 'Pending verification'} · enrolled {new Date(factor.createdAt).toLocaleDateString('en-ZA')}
                  </p>
                </div>
                <div className="flex gap-2">
                  {factor.status === 'verified' && aal?.currentLevel !== 'aal2' ? (
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => stepUp(factor.id)}>Step up to AAL2</Button>
                  ) : null}
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => removeFactor(factor.id)}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!enrolling ? (
        <Button type="button" disabled={busy} onClick={startEnrollment}>
          {busy ? 'Starting…' : 'Enroll a new authenticator'}
        </Button>
      ) : (
        <div className="space-y-4 rounded-2xl border border-mk-line bg-mk-cream p-5">
          {qrCodeSvg ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-mk-ink">Scan this with your authenticator app (Google Authenticator, 1Password, Authy, etc.):</p>
              <div className="inline-block rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qrCodeSvg }} />
              {secret ? <p className="mt-2 text-xs text-mk-muted">Can&apos;t scan? Enter this key manually: <code className="rounded bg-white px-2 py-1">{secret}</code></p> : null}
            </div>
          ) : null}
          <div>
            <label htmlFor="mfa-code" className="text-sm font-semibold text-mk-ink">Enter the 6-digit code</label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))}
              className="mt-2 w-40 rounded-xl border border-mk-line px-3 py-2 text-lg tracking-[0.3em]"
              placeholder="000000"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={submitCode}>{busy ? 'Verifying…' : 'Verify'}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEnrolling(false); setQrCodeSvg(null); setSecret(null); setCode(''); setPendingFactorId(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
