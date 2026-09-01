import "../landing.css";
import { Navigation } from "../components/landing/navigation";
import { HeroSection } from "../components/landing/hero-section";
import { FeaturesSection } from "../components/landing/features-section";
import { HowItWorksSection } from "../components/landing/how-it-works-section";
import { InfrastructureSection } from "../components/landing/infrastructure-section";
import { PricingSection } from "../components/landing/pricing-section";
import { FooterSection } from "../components/landing/footer-section";

export default function Landing() {
  return (
    <main className="landing-page relative min-h-screen overflow-x-hidden noise-overlay">
      <Navigation />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <InfrastructureSection />
      <PricingSection />
      <FooterSection />
    </main>
  );
}
