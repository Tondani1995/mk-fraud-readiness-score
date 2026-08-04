/**
 * RC1 fulfilment-attempt parking route.
 *
 * A deliberately thin transport, in the same shape as the other RC1 control-plane routes. Every
 * authority decision stays in public.rc1_park_fulfilment_attempt: platform_admin at AAL2, the
 * eligible-status set, the actively-claimed and already-published refusals, the audit event and
 * idempotency. The route adds only a fail-fast shape check and a projection that keeps the
 * response free of raw database payload.
 *
 * The RPC is invoked through the operator's own JWT, exactly like the freeze routes, and is
 * revoked from service_role, so there is no service-role path even if this file were changed
 * carelessly.
 */
import { createRc1ParkFulfilmentAttemptPost } from '@/lib/rc1/control-plane';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createRc1ParkFulfilmentAttemptPost();
