import { z } from 'zod';

const invoiceDetailsSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  billingAddress: z.string().trim().min(1).max(500),
  addressee: z.string().trim().min(1).max(200),
  billingEmail: z.string().trim().email().max(320),
  vatNumber: z.string().trim().max(80).optional().or(z.literal('')),
  registrationNumber: z.string().trim().max(80).optional().or(z.literal('')),
  purchaseOrderReference: z.string().trim().max(120).optional().or(z.literal(''))
}).strict();

export type InvoiceDetails = {
  legalName: string;
  billingAddress: string;
  addressee: string;
  billingEmail: string;
  vatNumber: string;
  registrationNumber: string;
  purchaseOrderReference: string;
};

export type InvoiceRequest = {
  invoiceRequested: boolean;
  invoiceDetails: InvoiceDetails;
};

const EMPTY_INVOICE_DETAILS: InvoiceDetails = {
  legalName: '',
  billingAddress: '',
  addressee: '',
  billingEmail: '',
  vatNumber: '',
  registrationNumber: '',
  purchaseOrderReference: ''
};

function canonicalDetails(value: z.infer<typeof invoiceDetailsSchema>): InvoiceDetails {
  return {
    legalName: value.legalName,
    billingAddress: value.billingAddress,
    addressee: value.addressee,
    billingEmail: value.billingEmail,
    vatNumber: value.vatNumber ?? '',
    registrationNumber: value.registrationNumber ?? '',
    purchaseOrderReference: value.purchaseOrderReference ?? ''
  };
}

export function parseInvoiceRequest(value: unknown): { ok: true; value: InvoiceRequest } | { ok: false; message: string } {
  if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>).invoiceRequested !== 'boolean') {
    return { ok: false, message: 'Please choose whether you would like an invoice before continuing.' };
  }

  const body = value as Record<string, unknown>;
  if (body.invoiceRequested === false) return { ok: true, value: { invoiceRequested: false, invoiceDetails: EMPTY_INVOICE_DETAILS } };

  const parsed = invoiceDetailsSchema.safeParse(body.invoiceDetails);
  if (!parsed.success) return { ok: false, message: 'Please provide the required billing details for the invoice.' };
  return { ok: true, value: { invoiceRequested: true, invoiceDetails: canonicalDetails(parsed.data) } };
}

export { invoiceDetailsSchema };
