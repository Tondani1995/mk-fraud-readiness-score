/**
 * V1.2 manual fulfilment boundary. Payment confirmation does not start an automated customer
 * delivery job. Operators generate the selected report and deliver it directly to the customer.
 */

export type DeliveryWorkerResult =
  | { claimed: false; outcome: 'not_claimed' }
  | {
      claimed: true;
      authorizationId: string;
      outcome: 'delivered';
      mode: 'disabled' | 'test' | 'live';
    }
  | {
      claimed: true;
      authorizationId: string;
      outcome: 'retry_scheduled' | 'failed_terminal' | 'reconciliation_required';
    }
  | {
      claimed: false;
      outcome: 'claim_failed';
      errorCode: string | null;
    };

export async function processOneDelivery(db: any, options: {
  authorizationId?: string;
  expectedOrderId?: string;
  leaseSeconds?: number;
} = {}): Promise<DeliveryWorkerResult> {
  void db;
  void options;
  return { claimed: false, outcome: 'not_claimed' };
}
