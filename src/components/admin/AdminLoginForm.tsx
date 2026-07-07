'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function AdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const payload = await response.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!response.ok || !payload.ok) {
      setError(payload.error ?? 'Admin login failed.');
      return;
    }

    window.location.href = '/admin';
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 px-4 py-3 text-sm text-mk-danger">{error}</div> : null}
      <label className="block">
        <span className="text-sm font-medium text-mk-charcoal">Admin email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-brass"
          autoComplete="email"
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-mk-charcoal">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-brass"
          autoComplete="current-password"
          required
        />
      </label>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Checking admin access…' : 'Sign in to MK admin'}
      </Button>
    </form>
  );
}
