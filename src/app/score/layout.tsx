import { AppChrome } from '@/components/layout/AppChrome';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Fraud Readiness Assessment | MK Fraud Insights',
    template: '%s | MK Fraud Insights'
  },
  description: 'Complete the MK Fraud Insights fraud readiness assessment and review your organisation’s result.'
};

export default function ScoreLayout({ children }: { children: React.ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
