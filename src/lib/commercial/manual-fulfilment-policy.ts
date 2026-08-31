/**
 * V1.2 fulfilment boundary: customer delivery is handled directly by MK after an operator
 * confirms payment and prepares the selected deliverable. The automated customer email/access
 * path remains available only as historical infrastructure and is fail-closed at its boundaries.
 */
export const MANUAL_CUSTOMER_DELIVERY_REASON = 'manual_customer_delivery_required';
export const MANUAL_CUSTOMER_DELIVERY_MESSAGE = 'MK sends the completed deliverable directly after manual preparation.';
