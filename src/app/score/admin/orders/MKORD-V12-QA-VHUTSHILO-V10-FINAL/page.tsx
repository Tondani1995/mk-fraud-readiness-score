import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { VhutshiloRecoveryWorkspace } from '@/components/admin/VhutshiloRecoveryWorkspace';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import type { AdminSession } from '@/lib/auth/admin-route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ORDER_REFERENCE = 'MKORD-V12-QA-VHUTSHILO-V10-FINAL';
const PDF_PATH = '/qa/RPT-MKFRS-V12-ESS-VHUTSHILO-V1.pdf';

const RECOVERY_ADMIN: AdminSession = {
  id: 'vhutshilo-recovery-acceptance',
  email: 'readiness-console@mkfraud.co.za',
  fullName: 'MK Readiness Console',
  role: 'platform_admin'
};

function SnapshotValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-mk-ink">{value}</p>
    </div>
  );
}

export default async function VhutshiloRecoveryAcceptancePage() {
  return (
    <AdminShell admin={RECOVERY_ADMIN}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Recovery acceptance order"
          title={ORDER_REFERENCE}
          description="Vhutshilo Foods Manufacturing (Pty) Ltd — Essential V1.2 customer-output acceptance fixture. This page exposes the captured recovery artefact and provides bounded preview-only generation controls without creating or mutating a commercial order."
        />

        <Card>
          <CardHeader><CardTitle>Acceptance snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <SnapshotValue label="Organisation" value="Vhutshilo Foods Manufacturing (Pty) Ltd" />
              <SnapshotValue label="Package" value="Essential — PDF only" />
              <SnapshotValue label="Readiness score" value="43.33 / 100" />
              <SnapshotValue label="Maturity" value="Developing" />
              <SnapshotValue label="Coverage" value="100%" />
              <SnapshotValue label="Applicable controls" value="60" />
              <SnapshotValue label="Critical gaps" value="6" />
              <SnapshotValue label="Major gaps" value="3" />
            </div>
            <div className="rounded-xl border border-mk-line bg-mk-cream/60 p-4 text-sm leading-6 text-mk-muted">
              This is the synthetic recovery acceptance case used to prove the V1.2 Essential report. It is intentionally not persisted in the staging orders table. Opening this page makes no provider call and does not touch production. The generation control below is hard-bound to this Vhutshilo preview fixture and the preview-only recovery pipeline.
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={PDF_PATH}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-mk-charcoal px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Open captured PDF
              </a>
              <Link
                href="/score/admin/orders"
                className="inline-flex items-center justify-center rounded-xl border border-mk-line bg-white px-4 py-2.5 text-sm font-semibold text-mk-ink transition hover:bg-mk-cream"
              >
                Back to admin orders
              </Link>
            </div>
          </CardContent>
        </Card>

        <VhutshiloRecoveryWorkspace initialPdfPath={PDF_PATH} />
      </div>
    </AdminShell>
  );
}
