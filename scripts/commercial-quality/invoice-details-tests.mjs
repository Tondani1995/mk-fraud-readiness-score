import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceDetailsSchema, parseInvoiceRequest } from '../../src/lib/commercial/invoice-details.ts';

const details = {
  legalName: 'Example Health Logistics (Pty) Ltd',
  billingAddress: '1 Example Street, Johannesburg, 2001',
  addressee: 'Finance Department',
  billingEmail: 'finance@example.test',
  vatNumber: '4123456789',
  registrationNumber: '2020/123456/07',
  purchaseOrderReference: 'PO-2026-001'
};

test('invoice schema accepts the closed approved billing shape', () => {
  assert.deepEqual(invoiceDetailsSchema.parse(details), details);
  assert.deepEqual(parseInvoiceRequest({ invoiceRequested: true, invoiceDetails: details }), {
    ok: true,
    value: { invoiceRequested: true, invoiceDetails: details }
  });
});

test('no-invoice orders carry no billing details', () => {
  const result = parseInvoiceRequest({ invoiceRequested: false, invoiceDetails: { unexpected: 'ignored' } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    invoiceRequested: false,
    invoiceDetails: {
      legalName: '',
      billingAddress: '',
      addressee: '',
      billingEmail: '',
      vatNumber: '',
      registrationNumber: '',
      purchaseOrderReference: ''
    }
  });
});

test('invoice requests reject missing, malformed and extra billing fields', () => {
  assert.equal(parseInvoiceRequest({}).ok, false);
  assert.equal(parseInvoiceRequest({ invoiceRequested: true, invoiceDetails: { ...details, billingEmail: 'not-an-email' } }).ok, false);
  assert.equal(parseInvoiceRequest({ invoiceRequested: true, invoiceDetails: { ...details, unexpected: 'not accepted' } }).ok, false);
  assert.equal(parseInvoiceRequest({ invoiceRequested: true, invoiceDetails: { ...details, legalName: '' } }).ok, false);
});

console.log(JSON.stringify({ passed: true, checks: ['closed invoice shape', 'no-invoice empty details', 'invalid and extra fields rejected'] }, null, 2));
