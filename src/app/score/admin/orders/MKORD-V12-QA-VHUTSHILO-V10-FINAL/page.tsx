import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ORDER_REFERENCE = 'MKORD-V12-QA-VHUTSHILO-V10-FINAL';
const PDF_PATH = '/qa/RPT-MKFRS-V12-ESS-VHUTSHILO-V1.pdf';

function SnapshotValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-mk-ink">{value}</p>
    </div>
  );
}

export default async function VhutshiloRecoveryAcceptancePage() {
  const admin = await requireAdmin(['platform_admin', 'finance_admin', 'reviewer', 'approver', 'read_only_admin']);

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Recovery acceptance order"
          title={ORDER_REFERENCE}
          description="Vhutshilo Foods Manufacturing (Pty) Ltd — Essential V1.2 customer-output acceptance fixture. This page exposes the already-captured recovery artefact and does not create or mutate a commercial order."
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
              This is the synthetic recovery acceptance case used to prove the V1.2 Essential report. It is intentionally not persisted in the staging orders table. The PDF below is the captured recovery artefact; opening this page makes no provider call and does not touch production.
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={PDF_PATH}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-mk-charcoal px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Open report PDF
              </a>
              <a
                href="/score/admin/orders"
                className="inline-flex items-center justify-center rounded-xl border border-mk-line bg-white px-4 py-2.5 text-sm font-semibold text-mk-ink transition hover:bg-mk-cream"
              >
                Back to admin orders
              </a>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Report preview</CardTitle></CardHeader>
          <CardContent>
            <iframe
              title="Vhutshilo Essential V1.2 report"
              src={PDF_PATH}
              className="h-[78vh] min-h-[720px] w-full rounded-xl border border-mk-line bg-white"
            />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
