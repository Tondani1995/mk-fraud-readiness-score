'use client';

import { useState } from 'react';

export function AdminLogoutButton() {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch('/score/api/admin/session/logout', { method: 'POST' });
    } catch {
      // The redirect still takes the operator back to the sign-in surface; the server route is
      // responsible for clearing the cookies whenever the request reaches it.
    } finally {
      window.location.assign('/score/admin/login');
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="mt-4 w-full rounded-xl border border-mk-line px-4 py-2 text-sm font-semibold text-mk-ink hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
