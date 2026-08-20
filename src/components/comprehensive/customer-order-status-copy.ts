export type CustomerOrderStatusTier = 'essential' | 'comprehensive';

export type CustomerOrderStatusCopy = {
  assessmentTitle: string;
  assessmentDescription: string;
  paymentReleaseDescription: string;
  nextStepDescription: string;
  pdfLabel: string;
  registerLabel: string;
};

/** Customer-facing copy for the shared paid-order status surface. */
export function getCustomerOrderStatusCopy(tier: CustomerOrderStatusTier): CustomerOrderStatusCopy {
  if (tier === 'comprehensive') {
    return {
      assessmentTitle: 'Comprehensive automated assessment',
      assessmentDescription: 'This is an automated analytical assessment of the self-assessment information provided. It does not independently validate evidence, test operating effectiveness, or provide an assurance opinion.',
      paymentReleaseDescription: 'Payment is verified before the automated analytical package is released.',
      nextStepDescription: 'Once payment is verified, MK Fraud Insights generates the Comprehensive report PDF and supporting register, verifies both private files, and makes them available through the secure delivery link.',
      pdfLabel: 'Comprehensive report PDF',
      registerLabel: 'Comprehensive supporting register XLSX'
    };
  }

  return {
    assessmentTitle: 'Essential automated diagnostic',
    assessmentDescription: 'This is an automated diagnostic based on the self-assessment information provided. It does not independently validate evidence, test operating effectiveness, or provide an assurance opinion.',
    paymentReleaseDescription: 'Payment is verified before the automated diagnostic package is released.',
    nextStepDescription: 'Once payment is verified, MK Fraud Insights generates the Essential report PDF and supporting register, verifies both private files, and makes them available through the secure delivery link.',
    pdfLabel: 'Essential report PDF',
    registerLabel: 'Essential supporting register XLSX'
  };
}
