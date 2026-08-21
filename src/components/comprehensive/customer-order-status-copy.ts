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
      paymentReleaseDescription: 'MK confirms payment manually before an operator prepares the purchased report package.',
      nextStepDescription: 'After MK confirms payment, an MK operator prepares and quality-checks the Comprehensive report PDF and supporting register. MK then emails the final files manually to your nominated delivery email and marks the order delivered.',
      pdfLabel: 'Comprehensive report PDF',
      registerLabel: 'Comprehensive supporting register XLSX'
    };
  }

  return {
    assessmentTitle: 'Essential automated diagnostic',
    assessmentDescription: 'This is an automated diagnostic based on the self-assessment information provided. It does not independently validate evidence, test operating effectiveness, or provide an assurance opinion.',
    paymentReleaseDescription: 'MK confirms payment manually before an operator prepares the purchased report package.',
    nextStepDescription: 'After MK confirms payment, an MK operator prepares and quality-checks the Essential report PDF and supporting register. MK then emails the final files manually to your nominated delivery email and marks the order delivered.',
    pdfLabel: 'Essential report PDF',
    registerLabel: 'Essential supporting register XLSX'
  };
}
