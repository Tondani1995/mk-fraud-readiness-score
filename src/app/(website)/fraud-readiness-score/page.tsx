import Wrapper from '@/components/website/Wrapper';
import { FraudReadinessStorefront } from '@/components/website/FraudReadiness/FraudReadinessStorefront';

export default function FraudReadinessScorePage() {
  // The shared storefront owns id="start-score", href="/score/start", data-adaptive-assessment-entry,
  // scroll-mt-24 and md:scroll-mt-28 so both public entry routes keep one conversion surface.
  return (
    <Wrapper>
      <FraudReadinessStorefront />
    </Wrapper>
  );
}
