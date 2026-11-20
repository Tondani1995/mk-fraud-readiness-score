"use client";

import { useEffect, useState } from "react";

import { PaymentStatePanel } from "./PaymentStatePanel";

const MAX_STATUS_POLLS = 20;

export function PaymentReturnStatus({
  orderReference,
}: {
  orderReference: string;
}) {
  const [state, setState] = useState("PAYMENT_PENDING");
  const [fulfilment, setFulfilment] = useState("NOT_REQUESTED");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pollCount = 0;
    async function poll() {
      pollCount += 1;
      try {
        const response = await fetch(
          `/score/api/payments/${encodeURIComponent(orderReference)}/status`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.ok) {
          setError(
            "Verified payment status is not available for this browser session.",
          );
          return;
        }
        setState(body.payment.state);
        setFulfilment(body.payment.fulfilment_trigger_result);
        setError(null);
        if (
          ["PAYMENT_PENDING", "PAYMENT_PROCESSING"].includes(body.payment.state)
        ) {
          if (pollCount < MAX_STATUS_POLLS) timer = setTimeout(poll, 3000);
          else
            setError(
              "Verified payment is still awaiting confirmation. Refresh this page later to check again.",
            );
        }
      } catch (pollError) {
        if (
          pollError instanceof DOMException &&
          pollError.name === "AbortError"
        )
          return;
        setError(
          "Verified payment status is temporarily unavailable. Please refresh to retry.",
        );
      }
    }
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [orderReference]);
  return (
    <PaymentStatePanel
      state={state}
      fulfilment={fulfilment}
      error={error}
      orderReference={orderReference}
    />
  );
}
