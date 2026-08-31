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
      paymentSummary: 'MK confirms your EFT payment manually before preparing the full Comprehensive package.',
      nextSteps: [
        'Use the EFT instructions and payment reference shown below.',
        'After MK confirms payment, MK prepares the full Comprehensive Fraud Readiness package.',
        'The package includes the detailed report, supporting registers and implementation material described in the product catalogue.',
        'MK will contact you directly if clarification is needed, then send the completed package directly.'
      ],
      deliverableSummary: 'A detailed report with supporting management, register and implementation material from the Comprehensive product catalogue.'
    };
  }

  return {
    productLabel: 'Essential Fraud Readiness',
    paymentSummary: 'MK confirms your EFT payment manually before preparing the Essential report.',
    nextSteps: [
      'Use the EFT instructions and payment reference shown below.',
      'After MK confirms payment, MK prepares your Essential Fraud Readiness report.',
      'MK sends the completed report directly to you.'
    ],
    deliverableSummary: 'A professionally prepared Essential Fraud Readiness report based on your completed self-assessment.'
  };
}
