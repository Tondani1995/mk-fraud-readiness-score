import Wrapper from "@/components/website/Wrapper";
import CTASection from "@/components/website/Home/CTASection";
import HeroSection from "@/components/website/Home/HeroSection";
import HowItWorksSection from "@/components/website/Home/HowItWorksSection";
import LeadMagnetSection from "@/components/website/Home/LeadMagnetSection";
import ProblemSection from "@/components/website/Home/ProblemSection";
import ProofSection from "@/components/website/Home/ProofSection";
import ServicesSection from "@/components/website/Home/ServicesSection";

export default function HomePg() {
    return (
        <Wrapper>
            <div>
                <HeroSection />
                <ProblemSection />
                <ServicesSection />
                <HowItWorksSection />
                <ProofSection />
                <LeadMagnetSection />
                <CTASection />
            </div>
        </Wrapper>
    )
}
