import { useEffect, useRef, useState } from "react";

const features = [
  {
    number: "01",
    title: "Agent Commerce API",
    description: "REST endpoints for store discovery, catalog search, cart, and Razorpay checkout — built for autonomous agents.",
    image: "/placeholder.svg",
  },
  {
    number: "02",
    title: "8-Rule Policy Engine",
    description: "Budget caps, velocity limits, category ACL, human-review thresholds, and merchant kill-switch before every payment.",
    image: "/placeholder.svg",
  },
  {
    number: "03",
    title: "Agent Identity Tokens",
    description: "Cryptographically scoped spending authority with session limits, category constraints, and full audit trail.",
    image: "/placeholder.svg",
  },
  {
    number: "04",
    title: "Multi-Store Discovery",
    description: "Agents compare catalogs across GadgetNest, ConnectHub, and more — structured JSON manifests, no HTML scraping.",
    image: "/placeholder.svg",
  },
  {
    number: "05",
    title: "Live Agent Brain",
    description: "Launch an LLM tool-calling agent from the dashboard — watch discover → compare → policy → checkout live.",
    image: "/placeholder.svg",
  },
  {
    number: "06",
    title: "Merchant Manifests",
    description: "Machine-readable store policies, catalog schemas, and AI-buyer settings at /v1/stores/:id/manifest.",
    image: "/placeholder.svg",
  },
  {
    number: "07",
    title: "Audit & Analytics",
    description: "Every agent action logged with reasoning, policy verdicts, and Razorpay order IDs — full merchant visibility.",
    image: "/placeholder.svg",
  },
  {
    number: "08",
    title: "UAP / ACP Aligned",
    description: "Merchant-side layer complementing NPCI UAP and global agent-commerce protocols — Razorpay-native payments.",
    image: "/placeholder.svg",
  },
];

function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`group relative transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="block">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 py-12 lg:py-20 border-b border-foreground/10 hover:bg-foreground/5 transition-colors -mx-6 px-6 lg:-mx-12 lg:px-12 rounded-3xl">
          <div className="shrink-0">
            <span className="font-mono text-sm text-muted-foreground">{feature.number}</span>
          </div>
          
          <div className="flex-1 grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-3xl lg:text-4xl font-display mb-4 group-hover:translate-x-2 transition-transform duration-500">
                {feature.title}
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
            
            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-[320px] aspect-video relative overflow-hidden rounded-xl border border-foreground/10 group-hover:scale-105 transition-transform duration-700">
                <img 
                  src={feature.image} 
                  alt={feature.title} 
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="work" ref={sectionRef} className="relative py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Protocol Features
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Everything agents need
            <br />
            <span className="text-muted-foreground">to buy from merchants</span>
          </h2>
        </div>

        <div>
          {features.map((feature, index) => (
            <FeatureCard key={feature.number} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
