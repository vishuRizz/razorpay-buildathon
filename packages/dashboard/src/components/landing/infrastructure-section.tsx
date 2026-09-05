import { useEffect, useState, useRef } from "react";

const skillCategories = [
  { 
    title: "Discovery Layer", 
    description: "Store manifests, catalog APIs, multi-merchant search",
  },
  { 
    title: "Policy & Safety", 
    description: "8-rule engine, human review, merchant kill-switch",
  },
  { 
    title: "Agent Runtime", 
    description: "LLM tool-calling, Groq function calling, live trace",
  },
  { 
    title: "Payments", 
    description: "Razorpay orders, UPI checkout, payment webhooks",
  },
  { 
    title: "Identity & Auth", 
    description: "Agent Identity Tokens with scoped spending authority",
  },
  { 
    title: "Merchant Control", 
    description: "Dashboard, live feed, policy editor, analytics",
  },
];

export function InfrastructureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

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
      setActiveCategory((prev) => (prev + 1) % skillCategories.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section ref={sectionRef} id="skills" className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
            }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Protocol Stack
            </span>
            <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8">
              Built for
              <br />
              agent commerce.
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed mb-8">
              AISLE is infrastructure - not a chatbot. Merchants publish structured catalogs,
              agents transact through bounded APIs, and every rupee is gated by policy before
              Razorpay processes payment.
            </p>
            
            <div className="flex flex-wrap gap-2">
              {["NPCI UAP", "ACP", "AP2", "Razorpay", "Agent Identity"].map(spec => (
                <span key={spec} className="px-3 py-1 bg-foreground/5 text-sm font-medium rounded-full">
                  {spec}
                </span>
              ))}
            </div>
          </div>

          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}
          >
            <div className="border border-foreground/10 rounded-2xl overflow-hidden bg-background">
              <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between bg-foreground/5">
                <span className="text-sm font-mono text-muted-foreground">AISLE Stack</span>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-foreground/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-foreground/20" />
                </div>
              </div>

              <div>
                {skillCategories.map((category, index) => (
                  <div
                    key={category.title}
                    className={`px-6 py-5 border-b border-foreground/5 last:border-b-0 flex flex-col justify-center transition-all duration-300 ${
                      activeCategory === index ? "bg-foreground/[0.03]" : ""
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <span 
                        className={`w-2 h-2 mt-2 rounded-full shrink-0 transition-colors duration-300 ${
                          activeCategory === index ? "bg-foreground" : "bg-foreground/20"
                        }`}
                      />
                      <div>
                        <div className="font-semibold text-lg">{category.title}</div>
                        <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{category.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
