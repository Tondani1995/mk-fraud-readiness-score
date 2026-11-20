import { HomeStory } from '@/components/website/Home/HomeStory';
import Wrapper from '@/components/website/Wrapper';
import ProofSection from '@/components/website/Home/ProofSection';
import TriggersSection from '@/components/website/Home/TriggersSection';
import { loadPublishedInsights } from '@/lib/website/insights/repository';

export const revalidate = 3600;

/**
 * Homepage sequence: what MK does, why it matters, how MK helps, the flagship assessment, why MK
 * is credible, and when to bring MK in. Service detail, product tiers and pricing live deeper.
 */
export default async function HomePg() {
  const insights = await loadPublishedInsights();

  return (
    <Wrapper>
      <main className="bg-white">
        <HomeStory />
        <ProofSection insights={insights} />
        <TriggersSection />
      </main>
    </Wrapper>
  );
}
