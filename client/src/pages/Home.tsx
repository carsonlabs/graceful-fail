import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import {
  Zap, Shield, BarChart2, Code2, ArrowRight, CheckCircle2,
  AlertTriangle, RefreshCw, Lock, Terminal
} from "lucide-react";

const FEATURES = [
  {
    icon: Zap,
    title: "Instant Error Intelligence",
    description:
      "When your agent hits a 4xx or 5xx error, our LLM engine analyzes the exact payload and returns a precise, actionable fix — not a generic error message.",
  },
  {
    icon: Shield,
    title: "Security-First Design",
    description:
      "Sensitive headers (Authorization, Cookie, API keys) are stripped before any data reaches the LLM. Your credentials never leave the proxy layer.",
  },
  {
    icon: RefreshCw,
    title: "Zero-Overhead Pass-Through",
    description:
      "Successful requests (2xx/3xx) are forwarded transparently with no latency overhead. You only pay when the LLM is actually invoked on a failed request.",
  },
  {
    icon: Code2,
    title: "Agent-Native JSON Schema",
    description:
      "Every intercepted error returns a structured JSON envelope with is_retriable, actionable_fix_for_agent, and suggested_payload_diff — designed for autonomous agent consumption.",
  },
  {
    icon: BarChart2,
    title: "Full Observability",
    description:
      "Track every request, intercepted error, credit usage, and success rate from your developer dashboard. Filter by API key, date, or error type.",
  },
  {
    icon: Lock,
    title: "Tier-Based Rate Limiting",
    description:
      "Hobby, Pro, and Agency tiers with monthly request limits. Upgrade anytime. Credits only consumed on failed requests that trigger LLM analysis.",
  },
];

const PRICING = [
  {
    name: "Hobby",
    price: "Free",
    period: "",
    limit: "500 requests/month",
    features: ["500 proxied requests", "LLM error analysis", "API key management", "Request logs (7 days)", "Community support"],
    cta: "Start Free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    limit: "10,000 requests/month",
    features: ["10,000 proxied requests", "LLM error analysis", "Multiple API keys", "Request logs (30 days)", "Usage analytics", "Email support"],
    cta: "Get Pro",
    highlight: true,
  },
  {
    name: "Agency",
    price: "$99",
    period: "/month",
    limit: "50,000 requests/month",
    features: ["50,000 proxied requests", "$0.005 per extra request", "Unlimited API keys", "Request logs (90 days)", "Full analytics", "Priority support"],
    cta: "Get Agency",
    highlight: false,
  },
];

const CODE_EXAMPLE = `// Before: Your agent crashes on API errors
const response = await fetch("https://api.crm.com/contacts", {
  method: "POST",
  body: JSON.stringify({ name: "John Doe" }) // ❌ Wrong field
});
// Returns 422 — agent enters doom loop

// After: Route through Graceful Fail
const response = await fetch("https://your-app.com/api/proxy", {
  method: "POST",
  headers: {
    "Authorization": "Bearer gf_your_key",
    "X-Destination-URL": "https://api.crm.com/contacts",
    "X-Destination-Method": "POST",
  },
  body: JSON.stringify({ name: "John Doe" })
});

// Returns structured fix:
// {
//   "graceful_fail_intercepted": true,
//   "error_analysis": {
//     "is_retriable": true,
//     "actionable_fix_for_agent": "Remove 'name' field. Add 'first_name'
//       and 'last_name' as separate string fields, then retry.",
//     "suggested_payload_diff": {
//       "remove": ["name"],
//       "add": { "first_name": "string", "last_name": "string" }
//     }
//   }
// }`;

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Graceful Fail</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/status" className="hover:text-foreground transition-colors">Status</Link>
            <Link href="/changelog" className="hover:text-foreground transition-colors">Changelog</Link>
          </nav>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button size="sm" className="gap-2">
                  Dashboard <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            ) : (
              <Button size="sm" className="gap-2" onClick={() => (window.location.href = getLoginUrl())}>
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 md:py-32">
        <div className="container text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-8">
            <AlertTriangle className="w-3.5 h-3.5" />
            Stop your AI agents from breaking on API errors
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-6 leading-tight">
            The API proxy that teaches{" "}
            <span className="text-primary">your agents</span>{" "}
            how to fix their own mistakes
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Graceful Fail intercepts failed API calls, analyzes the error with an LLM, and returns
            structured, actionable correction instructions — so your agents can self-heal and retry
            autonomously.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="gap-2 text-base px-8 shadow-[0_0_20px_oklch(0.75_0.18_145_/_0.35)]"
              onClick={() => (window.location.href = isAuthenticated ? "/dashboard" : getLoginUrl())}
            >
              Start for Free <ArrowRight className="w-4 h-4" />
            </Button>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="gap-2 text-base px-8">
                <Terminal className="w-4 h-4" />
                See How It Works
              </Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-4">No credit card required · 500 requests/month free forever</p>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border bg-card/50 py-8">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "< 200ms", label: "Avg. analysis latency" },
              { value: "0", label: "Credentials leaked to LLM" },
              { value: "100%", label: "Pass-through transparency" },
              { value: "Free", label: "On successful requests" },
            ].map(({ value, label }) => (
              <div key={label}>
                <div className="text-2xl font-bold text-primary mb-1">{value}</div>
                <div className="text-sm text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for production AI workflows</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Every design decision optimized for autonomous agents running unsupervised at 3 AM.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="p-6 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 bg-card/30 border-y border-border">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">One line of code to add</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Replace your destination URL with the Graceful Fail proxy endpoint. That's it.
            </p>
          </div>
          <div className="max-w-3xl mx-auto">
            <div className="rounded-xl border border-border bg-background overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="ml-2 text-xs text-muted-foreground font-mono">agent.ts</span>
              </div>
              <pre className="p-5 text-xs font-mono text-foreground/90 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {CODE_EXAMPLE}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, usage-based pricing</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Credits only consumed when the LLM is invoked. Successful pass-through requests are always free.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PRICING.map(({ name, price, period, limit, features, cta, highlight }) => (
              <div
                key={name}
                className={`rounded-xl border p-8 flex flex-col ${
                  highlight
                    ? "border-primary bg-primary/5 shadow-[0_0_30px_oklch(0.75_0.18_145_/_0.15)]"
                    : "border-border bg-card"
                }`}
              >
                {highlight && (
                  <div className="text-xs font-semibold text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1 self-start mb-4">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-1">{name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">{price}</span>
                    <span className="text-muted-foreground text-sm">{period}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{limit}</p>
                </div>
                <ul className="space-y-3 flex-1 mb-8">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={highlight ? "default" : "outline"}
                  className="w-full"
                  onClick={() => (window.location.href = isAuthenticated ? "/dashboard" : getLoginUrl())}
                >
                  {cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-border">
        <div className="container text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Your agents deserve better error handling
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Join developers building resilient AI workflows. Start free, scale as you grow.
          </p>
          <Button
            size="lg"
            className="gap-2 text-base px-10 shadow-[0_0_20px_oklch(0.75_0.18_145_/_0.35)]"
            onClick={() => (window.location.href = isAuthenticated ? "/dashboard" : getLoginUrl())}
          >
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary-foreground" />
            </div>
            <span>Graceful Fail</span>
          </div>
          <p>© {new Date().getFullYear()} Graceful Fail. Built for AI engineers.</p>
        </div>
      </footer>
    </div>
  );
}
