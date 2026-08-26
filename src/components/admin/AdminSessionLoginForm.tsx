'use client';

import { FormEvent, useState } from 'react';

function safeNextPath(value: string) {
  return value === '/score/admin' || value.startsWith('/score/admin/') ? value : '/score/admin';
}

export function AdminSessionLoginForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/score/api/admin/session/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setError(payload.message ?? 'Unable to sign in with those credentials.');
        return;
      }
      window.location.assign(safeNextPath(nextPath));
    } catch {
      setError('Unable to sign in right now. Please try again later.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="text-sm font-semibold text-mk-ink" htmlFor="admin-session-email">Email</label>
        <input
          id="admin-session-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink outline-none ring-mk-brass focus:ring-2"
        />
      </div>
      <div>
        <label className="text-sm font-semibold text-mk-ink" htmlFor="admin-session-password">Password</label>
        <input
          id="admin-session-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink outline-none ring-mk-brass focus:ring-2"
        />
      </div>
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-mk-ink px-4 py-3 text-sm font-semibold text-mk-cream disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
