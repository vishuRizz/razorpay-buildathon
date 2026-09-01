import { ArrowUpRight } from "lucide-react";
import { AnimatedWave } from "./animated-wave";

const socialLinks = [
  { name: "GitHub", href: "https://github.com/vishuRizz/razorpay-buildathon" },
  { name: "Razorpay", href: "https://razorpay.com" },
];

export function FooterSection() {
  return (
    <footer className="relative border-t border-foreground/10" id="contact">
      <div className="absolute inset-0 h-64 opacity-20 pointer-events-none overflow-hidden">
        <AnimatedWave />
      </div>
      
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="py-16 lg:py-24 flex flex-col items-center text-center">
          <a href="#" className="flex flex-col items-center gap-4 mb-6">
            <img 
              src="/placeholder.svg" 
              alt="AISLE" 
              width={80} 
              height={80} 
              className="rounded-full object-cover border border-foreground/10"
            />
            <span className="text-3xl font-display mt-2">AISLE</span>
          </a>

          <p className="text-xl text-muted-foreground leading-relaxed mb-8 max-w-md">
            AI-to-AI Commerce Protocol · Razorpay Buildathon 2026
          </p>

          <div className="flex gap-6 justify-center">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-foreground/70 hover:text-foreground transition-colors flex items-center gap-1 group"
              >
                {link.name}
                <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </a>
            ))}
          </div>
        </div>

        <div className="py-8 border-t border-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2026 AISLE. Razorpay AI Buildathon · Track 01
          </p>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              NPCI UAP · ACP Aligned
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
