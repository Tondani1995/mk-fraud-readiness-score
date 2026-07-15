import Wrapper from '@/components/website/Wrapper'
import AwarenessResilienceSection from '@/components/website/Services/AwarenessResilienceSection'
import EngagementOptionsSection from '@/components/website/Services/EngagementOptionsSection'
import FraudHealthCheckSection from '@/components/website/Services/FraudHealthCheckSection'
import FraudProgrammeDesignSection from '@/components/website/Services/FraudProgrammeDesignSection'
import FraudReadinessScoreSection from '@/components/website/Services/FraudReadinessScoreSection'
import InternalFraudControlsSection from '@/components/website/Services/InternalFraudControlsSection'
import ServicesHero from '@/components/website/Services/ServicesHero'
import ThreatIntelligenceSection from '@/components/website/Services/ThreatIntelligenceSection'
import React from 'react'

export default function page() {
    return (
        <Wrapper>
            <div>
                <ServicesHero />
                <FraudReadinessScoreSection />
                <FraudHealthCheckSection />
                <ThreatIntelligenceSection />
                <FraudProgrammeDesignSection />
                <AwarenessResilienceSection />
                <InternalFraudControlsSection />
                <EngagementOptionsSection />
            </div>
        </Wrapper>
    )
}
