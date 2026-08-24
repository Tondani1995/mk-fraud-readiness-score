'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { OrderProductState } from '@/lib/commercial/order-service';

function lifecycleLabel(state: string) {
  return state.replace(/_/g, ' ');
}

export function ComprehensiveOperationsWorkspace({ orderReference }: { orderReference: string }) {
  const [order, setOrder] = useState<OrderProductState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/score/api/commercial/orders/${encodeURIComponent(orderReference)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.ok) throw new Error('Order status is unavailable.');
        if (active) setOrder(body.order as OrderProductState);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Order status is unavailable.');
      });
    return () => { active = false; };
  }, [orderReference]);

  if (error) return <Card><CardContent className="p-6 text-sm text-mk-danger">{error}</CardContent></Card>;
  if (!order) return <Card><CardContent className="p-6 text-sm text-mk-muted">Loading automated fulfilment status…</CardContent></Card>;

  const fulfilment = order.automatedFulfilment;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Comprehensive automated fulfilment</CardTitle>
          <p className="text-sm text-mk-muted">Order {order.orderReference}</p>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <p><strong className="text-mk-ink">Product:</strong> {order.productName}</p>
          <p><strong className="text-mk-ink">Price:</strong> {order.amountDisplay}</p>
          <p><strong className="text-mk-ink">Payment:</strong> {lifecycleLabel(order.status)}</p>
          <p><strong className="text-mk-ink">Lifecycle:</strong> <Badge>{fulfilment?.state ? lifecycleLabel(fulfilment.state) : 'awaiting payment'}</Badge></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Automated delivery package</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-mk-muted">
          <p>Generation: {fulfilment?.generationStatus ? lifecycleLabel(fulfilment.generationStatus) : 'not started'}</p>
          <p>Delivery: {fulfilment?.deliveryStatus ? lifecycleLabel(fulfilment.deliveryStatus) : 'not queued'}</p>
          <p>Version: {fulfilment?.versionNumber ?? '—'}</p>
          {fulfilment?.deliverables.length ? (
            <ul className="space-y-2">
              {fulfilment.deliverables.map((deliverable) => (
                <li key={deliverable.artefactType} className="rounded-xl border border-mk-line px-4 py-3">
                  <strong className="text-mk-ink">{deliverable.fileName}</strong>
                  <span className="ml-2">{deliverable.mimeType}, {deliverable.fileSizeBytes.toLocaleString()} bytes, version {deliverable.artifactVersion}</span>
                </li>
              ))}
            </ul>
          ) : <p>The verified PDF and supporting register are not yet ready for secure delivery.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
