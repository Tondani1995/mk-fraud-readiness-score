import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function getAdminDashboardCounts() {
  const service = createSupabaseServiceClient();

  const [assessments, orders, reports, reportRequests, products, auditEvents] = await Promise.all([
    service.from('assessments').select('id', { count: 'exact', head: true }),
    service.from('orders').select('id', { count: 'exact', head: true }),
    service.from('reports').select('id', { count: 'exact', head: true }),
    service.from('data_requests').select('id', { count: 'exact', head: true }).eq('request_type', 'detailed_report'),
    service.from('products').select('id', { count: 'exact', head: true }),
    service.from('audit_logs').select('id', { count: 'exact', head: true })
  ]);

  return {
    assessmentCount: assessments.count ?? 0,
    orderCount: orders.count ?? 0,
    reportCount: reports.count ?? 0,
    reportRequestCount: reportRequests.count ?? 0,
    productCount: products.count ?? 0,
    auditEventCount: auditEvents.count ?? 0
  };
}
