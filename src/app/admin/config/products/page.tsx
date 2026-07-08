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
  const { products, appSettings } = await getAdminProductConfig();
  const eftSettings = appSettings.filter((setting: any) => /eft|bank|payment|reference/i.test(setting.setting_key));

  return (
    <ProtectedAdminPage allowedRoles={['platform_admin', 'finance_admin', 'read_only_admin']}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Commercial configuration"
          title="Products, pricing and EFT inputs"
          description="Review V1 package, pricing and payment-copy inputs before MK enables the controlled order and verification workflow."
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
                      <td className="py-3 text-mk-muted">{product.requires_payment_verification ? 'Manual verification required' : 'No payment gate'}</td>
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
          <CardHeader><CardTitle>EFT and payment settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {eftSettings.length ? eftSettings.map((setting: any) => (
              <div key={setting.setting_key} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm">
                <p className="font-semibold text-mk-ink">{setting.setting_key}</p>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-mk-paper p-3 text-xs text-mk-muted">{JSON.stringify(setting.setting_json, null, 2)}</pre>
              </div>
            )) : <p className="text-sm leading-6 text-mk-muted">No EFT-specific app settings are visible yet. MK must add the controlled EFT instructions before paid report orders are accepted.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Release boundary</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-mk-muted">This screen is a configuration review surface only. It does not verify payments, unlock reports, upload proof of payment or generate PDFs. Those actions remain blocked until the controlled commercial and report-release workflows are approved.</p>
          </CardContent>
        </Card>
      </div>
    </ProtectedAdminPage>
  );
}
