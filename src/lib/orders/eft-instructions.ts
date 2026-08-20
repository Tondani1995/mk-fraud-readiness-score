import { createSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Manual EFT instruction snapshotting, extracted from manual-eft-orders.ts so that both the legacy
 * Essential order path and the joint-launch catalogue order service can use it without importing
 * each other. Behaviour is unchanged from the original definitions.
 */

function service() {
  return createSupabaseServiceClient() as any;
}

export function formatOrderAmount(amountCents: number | null | undefined, currency: string | null | undefined) {
  const amount = Number(amountCents ?? 0) / 100;
  return `${currency ?? 'ZAR'} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type CustomerSafeEftInstructions = {
  active: true;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
  accountType: string | null;
  currency: string;
  paymentReferenceInstruction: string;
  customerInstruction: string;
  contactEmail: string | null;
};

export function customerSafeEftInstructions(value: unknown): CustomerSafeEftInstructions | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const text = (key: string) => typeof row[key] === 'string' ? String(row[key]).trim() : '';
  const bankName = text('bankName') || text('bank_name');
  const accountHolder = text('accountHolder') || text('account_holder');
  const accountNumber = text('accountNumber') || text('account_number');
  const branchCode = text('branchCode') || text('branch_code');
  const currency = text('currency') || 'ZAR';
  if (row.active !== true || !bankName || !accountHolder || !accountNumber || !branchCode || !currency) return null;
  return {
    active: true,
    bankName,
    accountHolder,
    accountNumber,
    branchCode,
    accountType: text('accountType') || text('account_type') || null,
    currency,
    paymentReferenceInstruction: text('paymentReferenceInstruction') || text('payment_reference_instruction') || 'Use your order reference as the payment reference.',
    customerInstruction: text('customerInstruction') || text('customer_instruction') || 'MK Fraud Insights confirms EFT payments manually before any deliverable is released.',
    contactEmail: text('contactEmail') || text('contact_email') || null
  };
}

export async function getActiveEftInstructions() {
  const db = service();
  const { data: activeSetting } = await db
    .from('eft_settings')
    .select('bank_name,account_holder,account_number,branch_code,account_type,currency,payment_reference_instruction,customer_instruction,contact_email,is_active,updated_at')
    .eq('is_active', true)
    .maybeSingle();

  if (activeSetting) {
    return {
      active: true,
      bankName: activeSetting.bank_name,
      accountHolder: activeSetting.account_holder,
      accountNumber: activeSetting.account_number,
      branchCode: activeSetting.branch_code,
      accountType: activeSetting.account_type,
      currency: activeSetting.currency,
      paymentReferenceInstruction: activeSetting.payment_reference_instruction,
      customerInstruction: activeSetting.customer_instruction,
      contactEmail: activeSetting.contact_email,
      message: activeSetting.customer_instruction
    };
  }

  const { data } = await db
    .from('app_settings')
    .select('value_json')
    .eq('setting_key', 'eft_instructions')
    .maybeSingle();

  const value = data?.value_json ?? {};
  return {
    active: value.active === true,
    bankName: value.bank_name ?? value.bankName,
    accountHolder: value.account_holder ?? value.accountHolder,
    accountNumber: value.account_number ?? value.accountNumber,
    branchCode: value.branch_code ?? value.branchCode,
    accountType: value.account_type ?? value.accountType ?? null,
    currency: value.currency ?? 'ZAR',
    paymentReferenceInstruction: value.payment_reference_instruction ?? value.paymentReferenceInstruction ?? 'Use your order reference as the payment reference.',
    customerInstruction: value.customer_instruction ?? value.customerInstruction ?? 'MK Fraud Insights confirms EFT payments manually before any detailed report is released.',
    contactEmail: value.contact_email ?? value.contactEmail ?? 'hello@mkfraud.co.za',
    message: value.message ?? 'MK Fraud Insights will send EFT instructions directly after reviewing the report request.'
  };
}

export async function buildEftInstructionSnapshot() {
  const instructions = await getActiveEftInstructions();
  return {
    ...instructions,
    capturedAt: new Date().toISOString(),
    paymentGateway: false,
    proofUpload: false,
    reportUnlock: false
  };
}
