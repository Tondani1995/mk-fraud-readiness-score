import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function getAdminDashboardCounts() {
  const service = createSupabaseServiceClient();

  const [assessments, orders, reports] = await Promise.all([
    service.from('assessments').select('id', { count: 'exact', head: true }),
    service.from('orders').select('id', { count: 'exact', head: true }),
    service.from('reports').select('id', { count: 'exact', head: true })
  ]);

  return {
    assessmentCount: assessments.count ?? 0,
    orderCount: orders.count ?? 0,
    reportCount: reports.count ?? 0
  };
}
