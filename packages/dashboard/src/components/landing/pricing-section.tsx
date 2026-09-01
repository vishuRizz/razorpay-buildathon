import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";

const plans = [
  {
    name: "Agent Brain",
    description: "Live LLM demo",
    price: "Launch",
    features: [
      "Groq tool-calling agent with 6 commerce tools",
      "Real-time pipeline: discover → compare → checkout",
    ],
    cta: "Launch Agent",
    href: "/brain",
    popular: false,
  },
  {
    name: "Policy Engine",
    description: "8-rule safety gate",
    price: "Configure",
    features: [
      "Budget caps, velocity limits, category ACL",
      "Human review thresholds + merchant kill-switch",
    ],
    cta: "Open Policy",
    href: "/policy",
    popular: true,
  },
  {
    name: "Merchant Dashboard",
    description: "Full control plane",
    price: "Explore",
    features: [
      "Live feed, audit logs, analytics",
      "Multi-store catalog + simulate panel",
    ],
    cta: "Open Dashboard",
    href: "/live",
    popular: false,
  },
];

export function PricingSection() {
  return (
    <section id="services" className="relative py-32 lg:py-40 border-t border-foreground/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="max-w-3xl mb-20">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
            Dashboard Modules
          </span>
          <h2 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground mb-6">
            Try It Live
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl">
            Three modules to explore the full agent-commerce loop — from LLM agent to policy gate to merchant visibility.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-px bg-foreground/10">
          {plans.map((plan, idx) => (
            <div
              key={plan.name}
              className={`relative p-8 lg:p-12 bg-background ${
                plan.popular ? "md:-my-4 md:py-12 lg:py-16 border-2 border-foreground" : ""
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-8 px-3 py-1 bg-foreground text-primary-foreground text-xs font-mono uppercase tracking-widest">
                  Core Module
                </span>
              )}

              <div className="mb-8">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-3xl text-foreground mt-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
              </div>

              <div className="mb-8 pb-8 border-b border-foreground/10">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl lg:text-6xl text-foreground">
                    {plan.price}
                  </span>
                </div>
              </div>

              <ul className="space-y-4 mb-10">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                to={plan.href}
                className={`w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group ${
                  plan.popular
                    ? "bg-foreground text-primary-foreground hover:bg-foreground/90"
                    : "border border-foreground/20 text-foreground hover:border-foreground hover:bg-foreground/5"
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
