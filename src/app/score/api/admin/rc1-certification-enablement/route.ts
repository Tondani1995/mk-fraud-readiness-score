import { createRc1CertificationEnablementPost } from '@/lib/rc1/control-plane';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createRc1CertificationEnablementPost();
