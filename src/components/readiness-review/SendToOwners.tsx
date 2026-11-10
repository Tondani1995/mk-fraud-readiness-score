'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useReviewAction } from './useReviewAction';

/** Sends the open material questions to accountable functions. Available once the interview has ended. */
export function SendToOwners({ token, seq }: { token: string; seq: number }) {
  const router = useRouter();
  const { send } = useReviewAction<{ seq: number }>(token, { seq });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div data-review-send-owners>
      <Button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          const outcome = await send({ type: 'organisation.sendToOwners' });
          setBusy(false);
          if (outcome.ok) router.refresh();
          else setMessage(outcome.message);
        }}
      >
        {busy ? 'Sending…' : 'Send open questions to accountable functions'}
      </Button>
      {message && <p role="alert" className="mt-2 text-sm text-mk-danger">{message}</p>}
    </div>
  );
}
