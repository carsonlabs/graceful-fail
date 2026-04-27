import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Zap,
  ArrowRight,
  CheckCircle2,
  Terminal,
  Github,
  Sun,
  Moon,
  Sparkles,
  Code2,
  Bot,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

export default function LlmTax() {
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const ctaUrl = isAuthenticated ? "/dashboard" : getLoginUrl();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── Nav ── */}
      <header className="border-b border-border/50 sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16 gap-8">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-[0_0_12px_oklch(0.75_0.18_145_/_0.3)] group-hover:shadow-[0_0_20px_oklch(0.75_0.18_145_/_0.5)] transition-shadow">
              <Zap className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-base tracking-tight">SelfHeal</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/docs"
              className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Docs
            </Link>
            <a
              href="https://www.npmjs.com/package/llm-tax"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              llm-tax on npm
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {toggleTheme && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            )}
            <a
              href="https://github.com/carsonlabs/graceful-fail"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex"
            >
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <Github className="w-4 h-4" />
              </Button>
            </a>
            <Button
              size="sm"
              className="gap-1.5 shadow-[0_0_12px_oklch(0.75_0.18_145_/_0.25)]"
              onClick={() => (window.location.href = ctaUrl)}
            >
              {isAuthenticated ? "Dashboard" : "Get Started"}
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-primary/[0.07] rounded-full blur-[120px] pointer-events-none" />
        <div className="container relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-8 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5" />
            You ran <code className="font-mono">npx llm-tax</code> &mdash; here&apos;s the one-line fix
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-foreground mb-6 leading-[1.1]">
            Stop feeding bloated API responses{" "}
            <br className="hidden sm:block" />
            <span className="text-primary">to your LLMs.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            Proxy any API through SelfHeal with a <code className="font-mono text-primary">target_schema</code> and
            we&apos;ll normalize the response down to exactly the fields your agent uses. Less context. Lower cost.
            Faster reasoning.
          </p>

          <p className="text-sm text-primary/90 mb-10 max-w-xl mx-auto leading-relaxed">
            <span className="font-semibold">Already compliant? Free pass-through.</span> You only pay when SelfHeal
            actually slims the payload.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="gap-2.5 text-base px-10 h-12 shadow-[0_0_30px_oklch(0.75_0.18_145_/_0.35)] hover:shadow-[0_0_40px_oklch(0.75_0.18_145_/_0.5)] transition-shadow"
              onClick={() => (window.location.href = ctaUrl)}
            >
              Start free with 500 calls/mo <ArrowRight className="w-4.5 h-4.5" />
            </Button>
            <Link href="/dashboard/playground">
              <Button variant="outline" size="lg" className="gap-2.5 text-base px-10 h-12 border-border/60">
                <Terminal className="w-4.5 h-4.5" />
                Try in Playground
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Before/After ── */}
      <section className="py-20 border-t border-border/50">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-3">The fix</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Add three headers. Get back only what you asked for.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Before */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Code2 className="w-4 h-4 text-rose-400" />
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Before</span>
                <span className="ml-auto text-xs text-rose-400 font-medium">~2,400 tokens</span>
              </div>
              <pre className="font-mono text-xs text-muted-foreground overflow-x-auto leading-relaxed">
                {`fetch("https://api.example.com/users/42")
  // returns 47 fields, your agent uses 4
  // {
  //   id, name, email,
  //   created_at, updated_at, deleted_at,
  //   timezone, locale, avatar_url,
  //   phone_country_code, phone_national, ...
  //   (43 more fields you'll never read)
  // }`}
              </pre>
            </div>

            {/* After */}
            <div className="rounded-xl border border-primary/40 bg-primary/[0.03] p-6 shadow-[0_0_24px_oklch(0.75_0.18_145_/_0.15)]">
              <div className="flex items-center gap-2 mb-4">
                <Code2 className="w-4 h-4 text-primary" />
                <span className="font-mono text-xs uppercase tracking-wider text-primary">After</span>
                <span className="ml-auto text-xs text-primary font-medium">~180 tokens</span>
              </div>
              <pre className="font-mono text-xs text-foreground overflow-x-auto leading-relaxed">
                {`fetch("https://selfheal.dev/api/proxy", {
  method: "POST",
  headers: {
    "X-Destination-URL": "https://api.example.com/users/42"
  },
  body: JSON.stringify({
    target_schema: { id: 0, name: "", email: "" }
  })
})
// returns only id, name, email`}
              </pre>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Same data, ~92% fewer tokens. Compounds across every API call your agent makes.
          </p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-20 border-t border-border/50">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Pay for normalization, not pass-through.
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Free 500 calls/mo for testing. Then choose: pay-per-fix in USDC, or flat fee for teams.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                name: "Hobby",
                price: "$0",
                period: "free",
                desc: "500 calls/mo. Test, prototype, personal agents.",
                features: [
                  "All normalization features",
                  "Pass-through is free",
                  "Community Discord",
                ],
                cta: "Start free",
              },
              {
                name: "x402 Outcome",
                price: "$0.001",
                period: "per fix (USDC)",
                desc: "Pay-per-normalize via the x402 HTTP spec. Settled on Base L2.",
                features: [
                  "Zero subscription",
                  "Agent's wallet IS the API key",
                  "Free pass-through, pay only when SelfHeal slims the payload",
                ],
                cta: "View x402 docs",
                featured: true,
              },
              {
                name: "Reliability Plan",
                price: "$29",
                period: "team / month",
                desc: "Flat fee, unlimited under fair use. Predictable cost for teams.",
                features: [
                  "Up to 10 developers",
                  "10K calls/mo soft cap",
                  "Slack + email alerts, priority support",
                ],
                cta: "Start 14-day trial",
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl border p-6 ${
                  tier.featured
                    ? "border-primary/40 bg-primary/[0.03] shadow-[0_0_24px_oklch(0.75_0.18_145_/_0.15)]"
                    : "border-border bg-card"
                }`}
              >
                <h3 className="font-semibold text-lg mb-1">{tier.name}</h3>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-extrabold">{tier.price}</span>
                  <span className="text-xs text-muted-foreground">{tier.period}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{tier.desc}</p>
                <ul className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-foreground/90">{f}</span>
                    </li>
                  ))}
                </ul>
                {tier.name === "x402 Outcome" ? (
                  <Link href="/docs">
                    <Button variant="outline" className="w-full gap-1.5">
                      {tier.cta} <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                ) : (
                  <Button
                    className={`w-full gap-1.5 ${
                      tier.featured ? "shadow-[0_0_12px_oklch(0.75_0.18_145_/_0.25)]" : ""
                    }`}
                    variant={tier.featured ? "default" : "outline"}
                    onClick={() => (window.location.href = ctaUrl)}
                  >
                    {tier.cta} <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it relates to llm-tax ── */}
      <section className="py-20 border-t border-border/50">
        <div className="container max-w-3xl mx-auto text-center">
          <Bot className="w-10 h-10 text-primary mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
            llm-tax shows you the leak. SelfHeal plugs it.
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            <code className="font-mono text-primary">npx llm-tax</code> scans your codebase and tells you which API
            calls are wasting tokens. SelfHeal is the proxy that fixes those calls without you rewriting them. Drop
            the proxy in front, pass the schema you actually want, and stop paying tax on bytes your agent never reads.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <code className="text-sm font-mono bg-card border border-border rounded-lg px-5 py-2.5 text-muted-foreground">
              npx llm-tax <span className="text-primary">./src</span>
            </code>
            <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <code className="text-sm font-mono bg-card border border-border rounded-lg px-5 py-2.5 text-muted-foreground">
              pip install <span className="text-primary">graceful-fail</span>
            </code>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 border-t border-border/50">
        <div className="container max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Stop paying the LLM tax.
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Free for 500 calls/month. No credit card. Drop the proxy in, see the cost difference in your next bill.
          </p>
          <Button
            size="lg"
            className="gap-2.5 text-base px-10 h-12 shadow-[0_0_30px_oklch(0.75_0.18_145_/_0.35)] hover:shadow-[0_0_40px_oklch(0.75_0.18_145_/_0.5)] transition-shadow"
            onClick={() => (window.location.href = ctaUrl)}
          >
            Get Started Free <ArrowRight className="w-4.5 h-4.5" />
          </Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/50 py-10">
        <div className="container max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; 2026 SelfHeal. Built for AI engineers.</p>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">
              Docs
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
