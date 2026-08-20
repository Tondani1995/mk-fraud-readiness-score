import { getOrderProductState } from './order-service';

export const AUTOMATED_COMPREHENSIVE_ROUTE_RETIRED = 'automated_comprehensive_route_retired';

/**
 * The old Comprehensive admin endpoints remain only for legacy/Advisory database compatibility.
 * A current self-service Comprehensive order is automated and must never enter that reviewed
 * engagement surface.
 */
export async function isAutomatedComprehensiveOrder(orderReference: string): Promise<boolean> {
  const state = await getOrderProductState(orderReference);
  return state?.tier === 'comprehensive';
}
