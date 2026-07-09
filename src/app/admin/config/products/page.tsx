import { ProtectedAdminPage } from '@/components/admin/ProtectedAdminPage';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { getAdminProductConfig } from '@/lib/admin/assessment-review';

function formatMoney(cents: number | null | undefined, currency: string | null | undefined) {
  const amount = Number(cents ?? 0) / 100;
  return `${currency ?? 'ZAR'} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function AdminProductConfigPage() {
  const { products, appSettings, eftSettings } = await getAdminProductConfig();
  const paymentSettings = appSettings.filter((setting: any) => /eft|bank|payment|order/i.test(setting.setting_key));

  return (
    <ProtectedAdminPage allowedRoles={['platform_admin', 'finance_admin', 'read_only_admin']}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Commercial configuration"
          title="Products, pricing and EFT inputs"
          description="Review V1 package, pricing and payment-copy inputs before MK accepts controlled manual EFT orders."
        />

        <Card>
          <CardHeader><CardTitle>Product packages</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted"><tr><th className="py-2">Code</th><th>Name</th><th>Price</th><th>Payment</th><th>Delivery</th><th>Status</th></tr></thead>
                <tbody className="divide-y divide-mk-line">
                  {products.map((product: any) => (
                    <tr key={product.product_code}>
                      <td className="py-3 font-semibold text-mk-ink">{product.product_code}</td>
                      <td className="py-3 text-mk-muted">{product.name}</td>
                      <td className="py-3 text-mk-muted">{formatMoney(product.price_cents, product.currency)}</td>
                      <td className="py-3 text-mk-muted">{product.requires_payment_verification ? 'Manual confirmation required' : 'No payment gate'}</td>
                      <td className="py-3 text-mk-muted">{product.delivery_mode}</td>
                      <td className="py-3 text-mk-muted">{product.active ? <Badge>active</Badge> : <Badge>inactive</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!products.length ? <p className="mt-4 text-sm text-mk-muted">No products are currently configured.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Manual EFT settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {eftSettings.length ? eftSettings.map((setting: any) => (
              <div key={`${setting.bank_name}-${setting.updated_at}`} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-mk-ink">{setting.bank_name} · {setting.account_holder}</p>
                  {setting.is_active ? <Badge>active</Badge> : <Badge>inactive</Badge>}
                </div>
                <dl className="mt-3 grid gap-3 md:grid-cols-2">
                  <div><dt className="text-xs uppercase tracking-[0.16em] text-mk-muted">Branch code</dt><dd className="mt-1 text-mk-ink">{setting.branch_code}</dd></div>
                  <div><dt className="text-xs uppercase tracking-[0.16em] text-mk-muted">Currency</dt><dd className="mt-1 text-mk-ink">{setting.currency}</dd></div>
                  <div><dt className="text-xs uppercase tracking-[0.16em] text-mk-muted">Reference instruction</dt><dd className="mt-1 text-mk-ink">{setting.payment_reference_instruction}</dd></div>
                  <div><dt className="text-xs uppercase tracking-[0.16em] text-mk-muted">Contact</dt><dd className="mt-1 text-mk-ink">{setting.contact_email}</dd></div>
                </dl>
                <p className="mt-3 text-mk-muted">{setting.customer_instruction}</p>
              </div>
            )) : <p className="text-sm leading-6 text-mk-muted">No EFT-specific settings are visible yet. MK must add controlled EFT instructions before paid report orders are accepted.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment and order settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {paymentSettings.length ? paymentSettings.map((setting: any) => (
              <div key={setting.setting_key} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm">
                <p className="font-semibold text-mk-ink">{setting.setting_key}</p>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-mk-paper p-3 text-xs text-mk-muted">{JSON.stringify(setting.value_json, null, 2)}</pre>
              </div>
            )) : <p className="text-sm leading-6 text-mk-muted">No payment app settings are visible.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Release boundary</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-mk-muted">This screen is a configuration review surface only. It does not verify payments automatically, unlock reports, upload proof of payment or generate PDFs. Those actions remain blocked until the controlled report-release workflow is approved.</p>
          </CardContent>
        </Card>
      </div>
    </ProtectedAdminPage>
  );
}
