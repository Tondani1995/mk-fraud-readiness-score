import { createSupabaseServiceClient } from '@/lib/supabase/server';

const ORDER_PAGE_SIZE = 25;

export type AdminOrderListFilters = {
  status?: string;
  page?: number;
};

export const orderStatusOptions = [
  'created',
  'awaiting_payment',
  'proof_uploaded',
  'under_review',
  'verified',
  'rejected',
  'cancelled',
  'refunded'
];

export const adminMutableOrderStatuses = [
  'awaiting_payment',
  'under_review',
  'verified',
  'rejected',
  'cancelled'
];

export async function getAdminOrderList(filters: AdminOrderListFilters = {}) {
  const service = createSupabaseServiceClient() as any;
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * ORDER_PAGE_SIZE;
  const to = from + ORDER_PAGE_SIZE - 1;

  let query: any = service
    .from('orders')
    .select(
      'id,order_reference,status,amount_cents,currency,finance_notes,created_at,updated_at,verified_at,products(product_code,name,delivery_mode),assessments(assessment_reference,status,organisations(legal_name,trading_name,sector,industry),respondents(full_name,email,role_title))',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);

  const { data, count, error } = await query;
  if (error) {
    console.error('admin order list query failed', error);
    return { orders: [], count: 0, page, pageSize: ORDER_PAGE_SIZE };
  }

  return {
    orders: data ?? [],
    count: count ?? 0,
    page,
    pageSize: ORDER_PAGE_SIZE
  };
}
