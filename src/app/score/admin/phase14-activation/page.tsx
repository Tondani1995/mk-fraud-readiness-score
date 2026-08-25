import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  Phase14GateControl,
  Phase14PoliciesControl,
  Phase14AiRoutesControl,
  Phase14SettingsControl,
  Phase14RuntimeSecretControl
} from '@/components/admin/Phase14ActivationControls';
import { requireAdmin } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const POLICY_LABELS: Record<string, string> = {
  manual_generation: 'Manual report generation',
  automatic_fulfilment: 'Automatic fulfilment (V2 Phase 1 auto-generate on payment)',
  ai_narrative: 'AI narrative generation',
  automatic_email: 'Automatic customer email delivery',
  manual_delivery: 'Manual delivery (admin-triggered send)',
  manual_download: 'Manual preview/download',
  recipient_override: 'Test-recipient override',
  provider_webhook_ingestion: 'Resend webhook ingestion',
  storage_cleanup: 'Storage cleanup worker'
};

async function loadState() {
  const db = createSupabaseServiceClient() as any;
  const [{ data: gate }, { data: policies }, { data: aiRoutes }, { data: settingsRows }] = await Promise.all([
    db.from('phase14_security_gates').select('*').eq('gate_key', 'phase14-premium-report').maybeSingle(),
    db.from('phase14_feature_policies').select('*').order('policy_key'),
    db.from('phase14_ai_route_policies').select('*').order('requested_provider'),
    db.from('app_settings').select('setting_key,value_json').in('setting_key', ['phase14_autonomous_report_engine', 'phase14_delivery_policy'])
  ]);

  const settings: Record<string, unknown> = {};
  for (const row of settingsRows ?? []) {
    settings[row.setting_key] = row.value_json;
  }

  return {
    gate: gate ?? null,
    policies: policies ?? [],
    aiRoutes: aiRoutes ?? [],
    reportEngineSettings: (settings.phase14_autonomous_report_engine ?? {}) as Record<string, unknown>,
    deliveryPolicySettings: (settings.phase14_delivery_policy ?? {}) as Record<string, unknown>
  };
}

export default async function Phase14ActivationPage() {
  const admin = await requireAdmin(['platform_admin']);
  const state = await loadState();

  return (
    <AdminShell admin={admin}>
      <PageHeader
        eyebrow="Phase 14 · production activation"
        title="Security gate & automation controls"
        description="These controls are restricted to authenticated platform administrators and are independently reversible. Follow the staged sequence: satisfy the gate, enable the test-recipient override, then automatic fulfilment, then AI narrative, then — only after an internal test has run cleanly — automatic customer email."
      />


      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Security gate</CardTitle></CardHeader>
          <CardContent>
            <Phase14GateControl gate={state.gate} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Feature policies</CardTitle></CardHeader>
          <CardContent>
            <Phase14PoliciesControl policies={state.policies} labels={POLICY_LABELS} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>AI provider routes</CardTitle></CardHeader>
          <CardContent>
            <Phase14AiRoutesControl routes={state.aiRoutes} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Automation settings</CardTitle></CardHeader>
          <CardContent>
            <Phase14SettingsControl
              reportEngineSettings={state.reportEngineSettings}
              deliveryPolicySettings={state.deliveryPolicySettings}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Runtime secret provisioning (HMAC secrets)</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-mk-muted">
              These two secrets are never preloaded, displayed, or logged by this page — this control only shows
              a rotation timestamp and a non-secret SHA-256 fingerprint after a successful submission. Each secret
              must independently reach the matching Vercel Preview variable and this Supabase secret with the
              identical value; this page cannot see or verify what is stored in Vercel.
            </p>
            <div className="space-y-4">
              <Phase14RuntimeSecretControl
                secretKey="provider_webhook_db_hmac"
                vercelVarName="PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET"
                description="Verifies signed Resend webhook attestations before they are applied to an email_events row."
              />
              <Phase14RuntimeSecretControl
                secretKey="provider_lookup_db_hmac"
                vercelVarName="PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET"
                description="Verifies provider-lookup attestations (the reconciliation path independent of the webhook)."
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
