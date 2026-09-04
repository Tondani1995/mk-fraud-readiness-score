import type { SelfServicePaidTier } from './product-catalogue';

export type PostPurchaseCopy = {
  productLabel: string;
  paymentSummary: string;
  nextSteps: readonly string[];
  deliverableSummary: string;
};

/** Customer-facing post-purchase copy for the two distinct paid products. */
export function getPostPurchaseCopy(tier: SelfServicePaidTier): PostPurchaseCopy {
  if (tier === 'comprehensive') {
    return {
      productLabel: 'Comprehensive Fraud Readiness',
      paymentSummary: 'Once your EFT payment is confirmed, MK prepares the full Comprehensive Fraud Readiness package.',
      nextSteps: [
        'Use the EFT instructions and payment reference shown below.',
        'After MK confirms payment, MK prepares the full Comprehensive Fraud Readiness package.',
        'The package includes a detailed report, supporting registers, target-state control design and implementation material.',
        'MK sends the completed package directly to the address held for the order.'
      ],
      deliverableSummary: 'A detailed report with supporting registers, target-state control design and implementation material.'
    };
  }

  return {
    productLabel: 'Essential Fraud Readiness',
    paymentSummary: 'Once your EFT payment is confirmed, MK prepares your Essential Fraud Readiness report.',
    nextSteps: [
      'Use the EFT instructions and payment reference shown below.',
      'After MK confirms payment, MK prepares your Essential Fraud Readiness report.',
      'MK sends the completed report directly to you.'
    ],
    deliverableSummary: 'A professionally prepared Essential Fraud Readiness report based on your completed self-assessment.'
  };
}
