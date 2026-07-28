import { createRc1FreezeStatusGet } from '@/lib/rc1/control-plane';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createRc1FreezeStatusGet();
