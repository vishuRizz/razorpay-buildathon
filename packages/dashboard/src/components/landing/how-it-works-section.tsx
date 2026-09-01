import { useEffect, useRef, useState } from "react";

const experiences = [
  {
    number: "01",
    title: "Issue Agent Token",
    description: "Agent requests identity token with budget limits (Step 1)",
    code: `Agent requests an identity token with encoded budget limits and category constraints. Cryptographically signed — ₹3,000/session, connectivity + electronics allowed.`,
  },
  {
    number: "02",
    title: "Discover & Compare",
    description: "Query stores, browse catalogs across merchants (Step 2)",
    code: `Agent queries /v1/stores to find AI-enabled merchants. Searches catalogs at GadgetNest, ConnectHub — structured JSON, no scraping. Compares JioFi ₹2,499 vs Budget Hotspot ₹1,899.`,
  },
  {
    number: "03",
    title: "Policy Engine Check",
    description: "8-rule evaluator runs before payment (Step 3)",
    code: `8-rule safety evaluator runs before any payment. Checks budget cap, velocity, allowed categories, human-review threshold, merchant kill-switch. Returns APPROVED or BLOCKED with reasoning.`,
  },
  {
    number: "04",
    title: "Razorpay Checkout",
    description: "Create cart, pass policy gate, place order (Step 4)",
    code: `Agent creates cart, passes policy gate, initiates Razorpay checkout. Order ID + payment ID logged. Merchant sees full agent reasoning in audit trail.`,
  },
];

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);
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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % experiences.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="experience"
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-foreground text-background overflow-hidden"
    >
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 40px,
            currentColor 40px,
            currentColor 41px
          )`
        }} />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-background/50 mb-6">
            <span className="w-8 h-px bg-background/30" />
            Agent Flow
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            How It Works
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
          <div className="space-y-0">
            {experiences.map((step, index) => (
              <button
                key={step.number}
                type="button"
                onClick={() => setActiveStep(index)}
                className={`w-full text-left py-8 border-b border-background/10 transition-all duration-500 group ${
                  activeStep === index ? "opacity-100" : "opacity-40 hover:opacity-70"
                }`}
              >
                <div className="flex items-start gap-6">
                  <span className="font-display text-3xl text-background/30">{step.number}</span>
                  <div className="flex-1">
                    <h3 className="text-2xl lg:text-3xl font-display mb-3 group-hover:translate-x-2 transition-transform duration-300">
                      {step.title}
                    </h3>
                    <p className="text-background/60 leading-relaxed">
                      {step.description}
                    </p>
                    
                    {activeStep === index && (
                      <div className="mt-4 h-px bg-background/20 overflow-hidden">
                        <div 
                          className="h-full bg-background w-0"
                          style={{ animation: 'progress 6s linear forwards' }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:sticky lg:top-32 self-start">
            <div className="border border-background/10 overflow-hidden rounded-xl">
              <div className="px-6 py-4 border-b border-background/10 flex items-center justify-between bg-background/5">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <span className="text-xs font-mono text-background/40">agent_flow.ts</span>
              </div>

              <div className="p-8 font-mono text-sm min-h-[280px] bg-background/5">
                <pre className="text-background/70 whitespace-pre-wrap break-words">
                  {experiences[activeStep].code.split('. ').map((sentence, index, array) => (
                    <div 
                      key={`${activeStep}-${index}`} 
                      className="leading-loose code-line-reveal mb-2"
                      style={{ animationDelay: `${index * 150}ms` }}
                    >
                      <span className="text-background/40 select-none mr-4">{(index + 1).toString().padStart(2, '0')}</span>
                      <span className="text-background/90">{sentence}{index !== array.length - 1 ? '.' : ''}</span>
                    </div>
                  ))}
                </pre>
              </div>

              <div className="px-6 py-4 border-t border-background/10 flex items-center gap-3 bg-background/5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-mono text-background/40">Agent Running</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
