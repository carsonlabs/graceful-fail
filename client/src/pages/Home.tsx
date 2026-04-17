import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import {
  Zap, Shield, BarChart2, Code2, ArrowRight, CheckCircle2,
  AlertTriangle, RefreshCw, Lock, Terminal, Sun, Moon,
  Github, ExternalLink, Star, ChevronRight, Sparkles,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useState, useEffect } from "react";

// ─── Data ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Zap,
    title: "MCP Reliability Layer",
    description:
      "Only 72% of MCP calls succeed on first try in production. SelfHeal wraps any MCP server or API with retry, circuit-break, and fallback — then heals timeouts, tool failures, and auth errors with LLM-generated fixes at runtime.",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
  {
    icon: Shield,
    title: "Security-First Design",
    description:
      "Sensitive headers (Authorization, Cookie, API keys) are stripped before any data reaches the LLM. Your credentials never leave the proxy layer.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: RefreshCw,
    title: "Auto-Retry & Self-Heal",
    description:
      "Retriable errors are automatically fixed and retried. Your agent gets the success response as if the error never happened.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: Code2,
    title: "Agent-Native JSON Schema",
    description:
      "Every intercepted error returns a structured envelope with is_retriable, actionable_fix_for_agent, and suggested_payload_diff.",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    icon: BarChart2,
    title: "Full Observability",
    description:
      "Track every request, intercepted error, credit usage, and success rate. Filter by API key, date, or error type.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
  },
  {
    icon: Lock,
    title: "Outcome-Based Pricing",
    description:
      "Pay per successful heal via x402 micropayments (USDC). Successes pass through free. Failed analyses are never charged.",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
  },
];

const PRICING = [
  {
    name: "Pass-Through",
    price: "$0",
    period: "",
    limit: "Target returns 2xx/3xx",
    features: ["Instant proxy pass-through", "Zero cost, always", "No API key required", "No rate limits on success", "< 200ms overhead"],
    cta: "Read the Docs",
    ctaHref: "/docs",
    highlight: false,
  },
  {
    name: "Simple Heal",
    price: "$0.001",
    period: " USDC",
    limit: "400, 404, 405, 422 errors",
    features: ["LLM error diagnosis", "Structured fix instructions", "Auto-retry payload", "Only charged on success", "x402 micropayment (Base)"],
    cta: "Read the Docs",
    ctaHref: "/docs",
    highlight: true,
  },
  {
    name: "Complex Heal",
    price: "$0.003",
    period: "\u2013$0.005",
    limit: "429, 403, 5xx errors",
    features: ["Deep error analysis", "Multi-step fix strategies", "Rate limit recovery", "Only charged on success", "x402 micropayment (Base)"],
    cta: "Read the Docs",
    ctaHref: "/docs",
    highlight: false,
  },
];

const STEPS = [
  {
    num: "01",
    title: "Send through SelfHeal",
    desc: "POST your request to /api/x402/proxy with the target URL in the JSON body. No API key needed.",
  },
  {
    num: "02",
    title: "Success passes through free",
    desc: "2xx and 3xx responses are returned verbatim. Zero cost, zero overhead. You only pay when something breaks.",
  },
  {
    num: "03",
    title: "Failures get healed (pay on success)",
    desc: "Errors trigger a 402. Your agent pays via x402 micropayment, gets LLM-powered fix instructions, and only gets charged if the heal succeeds.",
  },
];

const LOGOS = [
  { name: "OpenAI", text: "OpenAI" },
  { name: "Stripe", text: "Stripe" },
  { name: "GitHub", text: "GitHub" },
  { name: "Twilio", text: "Twilio" },
  { name: "Slack", text: "Slack" },
  { name: "HubSpot", text: "HubSpot" },
];

const CODE_BEFORE = `const res = await fetch("https://api.crm.com/contacts", {
  method: "POST",
  body: JSON.stringify({ name: "John Doe" })
});
// 422 Unprocessable Entity
// Agent crashes. You get paged.`;

const CODE_AFTER = `const res = await fetch("https://selfheal.dev/api/x402/proxy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: "https://api.crm.com/contacts",
    method: "POST",
    body: JSON.stringify({ name: "John Doe" })
  })
});
// 200? Free pass-through.
// 422? Returns x402 payment spec → agent pays →
// LLM fixes { name } → { first_name, last_name }
// Settled only if heal succeeds. $0.001 USDC.`;

// ─── Animated counter ────────────────────────────────────────────────

function AnimatedStat({ value, label }: { value: string; label: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
      <div className="text-3xl md:text-4xl font-bold text-primary mb-1 tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

// ��── Component ───────────────────────────────────────────────────────

export default function Home() {
  const { isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
            {[
              { href: "#features", label: "Features" },
              { href: "#how-it-works", label: "How It Works" },
              { href: "#sdks", label: "SDKs" },
              { href: "#pricing", label: "Pricing" },
            ].map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {label}
              </a>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            <Link href="/docs" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              Docs
            </Link>
            <Link href="/status" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              Status
            </Link>
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
              <Button variant="ghost" size="sm" className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground">
                <Github className="w-4 h-4" />
              </Button>
            </a>
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button size="sm" className="gap-1.5 shadow-[0_0_12px_oklch(0.75_0.18_145_/_0.25)]">
                  Dashboard <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            ) : (
              <Button size="sm" className="gap-1.5 shadow-[0_0_12px_oklch(0.75_0.18_145_/_0.25)]" onClick={() => (window.location.href = ctaUrl)}>
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative py-28 md:py-40 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-primary/[0.07] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_oklch(0.75_0.18_145_/_0.04)_0%,_transparent_60%)] pointer-events-none" />

        <div className="container relative text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-10 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5" />
            Solves the 72% MCP reliability problem — retry, heal, verify
            <ChevronRight className="w-3 h-3 opacity-60" />
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground mb-8 leading-[1.1]">
            Your agents break.{" "}
            <br className="hidden sm:block" />
            <span className="text-primary">SelfHeal fixes them.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            The self-healing proxy for AI agents and MCP servers. Auto-retries on timeout,
            circuit-breaks cascading failures, heals 4xx/5xx with LLM-generated fixes —
            so your agents recover before you get paged.
          </p>

          {/* Install badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <code className="text-sm font-mono bg-card/80 backdrop-blur border border-border rounded-lg px-5 py-2.5 text-muted-foreground select-all hover:border-primary/40 transition-colors cursor-text">
              pip install <span className="text-primary font-medium">graceful-fail</span>
            </code>
            <code className="text-sm font-mono bg-card/80 backdrop-blur border border-border rounded-lg px-5 py-2.5 text-muted-foreground select-all hover:border-primary/40 transition-colors cursor-text">
              npm install <span className="text-primary font-medium">graceful-fail</span>
            </code>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="gap-2.5 text-base px-10 h-12 shadow-[0_0_30px_oklch(0.75_0.18_145_/_0.35)] hover:shadow-[0_0_40px_oklch(0.75_0.18_145_/_0.5)] transition-shadow"
              onClick={() => (window.location.href = ctaUrl)}
            >
              Start for Free <ArrowRight className="w-4.5 h-4.5" />
            </Button>
            <Link href="/dashboard/playground">
              <Button variant="outline" size="lg" className="gap-2.5 text-base px-10 h-12 border-border/60">
                <Terminal className="w-4.5 h-4.5" />
                Live Playground
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground/60 mt-5">
            No API key required &middot; Success is always free &middot; Pay-per-heal in USDC
          </p>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="border-y border-border/50 bg-card/30 py-6 overflow-hidden">
        <div className="container">
          <p className="text-center text-xs text-muted-foreground/50 uppercase tracking-widest font-medium mb-5">
            Works with any API your agents call
          </p>
          <div className="flex items-center justify-center gap-10 md:gap-16 flex-wrap">
            {LOGOS.map(({ name, text }) => (
              <span key={name} className="text-sm font-semibold text-muted-foreground/30 tracking-wide">
                {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="py-16 md:py-20">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center max-w-4xl mx-auto">
            <AnimatedStat value="< 200ms" label="Avg. analysis latency" />
            <AnimatedStat value="Zero" label="Credentials exposed" />
            <AnimatedStat value="100%" label="Pass-through on success" />
            <AnimatedStat value="$0" label="For successful requests" />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 md:py-32">
        <div className="container">
          <div className="text-center mb-20">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">Features</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              Built for production AI workflows
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Every design decision optimized for autonomous agents running unsupervised at 3 AM.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {FEATURES.map(({ icon: Icon, title, description, color, bg }) => (
              <div
                key={title}
                className="group relative p-6 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all duration-300"
              >
                <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-[15px]">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-24 md:py-32 bg-card/20 border-y border-border/50">
        <div className="container">
          <div className="text-center mb-20">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">Integration</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              Three lines. That's it.
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              POST a JSON body to SelfHeal, get results back. No API key, no setup.
            </p>
          </div>

          {/* Steps */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
            {STEPS.map(({ num, title, desc }) => (
              <div key={num} className="relative p-6 rounded-2xl border border-border/60 bg-card/50">
                <div className="text-4xl font-black text-primary/15 mb-3 leading-none">{num}</div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* Code comparison */}
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-5">
            {/* Before */}
            <div className="rounded-2xl border border-red-500/20 bg-background overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border/50 bg-card/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/40" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                </div>
                <span className="ml-2 text-xs text-red-400/80 font-mono font-medium">before.ts</span>
                <span className="ml-auto text-[10px] text-red-400/60 font-medium uppercase tracking-wide">Without SelfHeal</span>
              </div>
              <pre className="p-5 text-[13px] font-mono text-foreground/80 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {CODE_BEFORE}
              </pre>
            </div>

            {/* After */}
            <div className="rounded-2xl border border-emerald-500/20 bg-background overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border/50 bg-card/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-500/40" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                </div>
                <span className="ml-2 text-xs text-emerald-400/80 font-mono font-medium">after.ts</span>
                <span className="ml-auto text-[10px] text-emerald-400/60 font-medium uppercase tracking-wide">With SelfHeal</span>
              </div>
              <pre className="p-5 text-[13px] font-mono text-foreground/80 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {CODE_AFTER}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── SDKs ── */}
      <section id="sdks" className="py-24 md:py-32">
        <div className="container">
          <div className="text-center mb-20">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">SDKs</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              First-class SDK support
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Official SDKs for Python and Node.js. LangChain and CrewAI integrations included.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Python */}
            <div className="rounded-2xl border border-border/60 bg-card/50 p-7 hover:border-border transition-colors">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <span className="text-blue-400 font-bold text-sm">Py</span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Python SDK</h3>
                  <a href="https://pypi.org/project/graceful-fail/" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                    pypi.org/project/graceful-fail <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <div className="rounded-xl bg-[#0d1117] border border-[#30363d] p-5 mb-5">
                <pre className="text-[13px] font-mono text-[#e6edf3] leading-relaxed">{`import httpx

resp = httpx.post(
    "https://selfheal.dev/api/x402/proxy",
    json={"url": target_url, "method": "POST",
          "body": payload_json},
)
# 200? Free. 402? Pay $0.001 USDC, get fix.`}</pre>
              </div>
              <div className="flex flex-wrap gap-2">
                {["x402", "LangChain", "CrewAI", "Async"].map((tag) => (
                  <span key={tag} className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-3 py-1">{tag}</span>
                ))}
              </div>
            </div>
            {/* Node.js */}
            <div className="rounded-2xl border border-border/60 bg-card/50 p-7 hover:border-border transition-colors">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-emerald-400 font-bold text-sm">JS</span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Node.js / TypeScript</h3>
                  <a href="https://www.npmjs.com/package/graceful-fail" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                    npmjs.com/package/graceful-fail <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <div className="rounded-xl bg-[#0d1117] border border-[#30363d] p-5 mb-5">
                <pre className="text-[13px] font-mono text-[#e6edf3] leading-relaxed">{`const resp = await fetch(
  "https://selfheal.dev/api/x402/proxy",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: targetUrl, method: "POST",
      body: payloadJson,
    }),
  }
);
// 200? Free. 402? Pay $0.001 USDC, get fix.`}</pre>
              </div>
              <div className="flex flex-wrap gap-2">
                {["x402", "LangChain.js", "TypeScript", "Zero deps"].map((tag) => (
                  <span key={tag} className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-3 py-1">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 md:py-32 bg-card/20 border-y border-border/50">
        <div className="container">
          <div className="text-center mb-20">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">Pricing</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              Outcome-based pricing
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Agents pay in USDC via x402 only when errors are successfully healed. No subscriptions. No API keys.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {PRICING.map(({ name, price, period, limit, features, cta, ctaHref, highlight }) => (
              <div
                key={name}
                className={`relative rounded-2xl border p-8 flex flex-col transition-all duration-300 ${
                  highlight
                    ? "border-primary/50 bg-card shadow-[0_0_40px_oklch(0.75_0.18_145_/_0.1)] scale-[1.02]"
                    : "border-border/60 bg-card/50 hover:border-border"
                }`}
              >
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div className="text-[10px] font-bold text-primary-foreground bg-primary rounded-full px-4 py-1 shadow-[0_0_16px_oklch(0.75_0.18_145_/_0.4)] uppercase tracking-wider">
                      Most Common
                    </div>
                  </div>
                )}
                <div className="mb-8">
                  <h3 className="text-base font-semibold text-muted-foreground mb-3">{name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-extrabold text-foreground tracking-tight">{price}</span>
                    {period && <span className="text-muted-foreground text-base">{period}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{limit}</p>
                </div>
                <ul className="space-y-3 flex-1 mb-8">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${highlight ? "text-primary" : "text-muted-foreground/40"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={ctaHref}>
                  <Button
                    variant={highlight ? "default" : "outline"}
                    size="lg"
                    className={`w-full ${highlight ? "shadow-[0_0_20px_oklch(0.75_0.18_145_/_0.25)]" : ""}`}
                  >
                    {cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-28 md:py-36 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/[0.05] rounded-full blur-[100px] pointer-events-none" />
        <div className="container relative text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
            It's 3 AM. Your agent hits a 422.{" "}
            <br className="hidden sm:block" />
            <span className="text-primary">Does it crash — or fix itself?</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
            Stop babysitting your AI workflows. SelfHeal gives your agents the intelligence to recover on their own.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="gap-2.5 text-base px-12 h-13 shadow-[0_0_30px_oklch(0.75_0.18_145_/_0.35)] hover:shadow-[0_0_40px_oklch(0.75_0.18_145_/_0.5)] transition-shadow"
              onClick={() => (window.location.href = ctaUrl)}
            >
              Get Started Free <ArrowRight className="w-4.5 h-4.5" />
            </Button>
            <Link href="/docs">
              <Button variant="ghost" size="lg" className="gap-2 text-base text-muted-foreground">
                Read the Docs <ExternalLink className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/50 py-12">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <span className="font-bold text-sm">SelfHeal</span>
              </div>
              <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[200px]">
                Self-healing API proxy for AI agents. Built for engineers who ship.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Product</p>
              <div className="space-y-2.5">
                {[
                  { href: "#features", label: "Features" },
                  { href: "#pricing", label: "Pricing" },
                  { href: "/docs", label: "Documentation" },
                  { href: "/changelog", label: "Changelog" },
                  { href: "/status", label: "Status" },
                ].map(({ href, label }) => (
                  <a key={href} href={href} className="block text-sm text-muted-foreground/60 hover:text-foreground transition-colors">
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* Resources */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Resources</p>
              <div className="space-y-2.5">
                {[
                  { href: "/dashboard/playground", label: "Playground" },
                  { href: "/scan", label: "Free Scanner" },
                  { href: "https://pypi.org/project/graceful-fail/", label: "PyPI", ext: true },
                  { href: "https://www.npmjs.com/package/graceful-fail", label: "npm", ext: true },
                ].map(({ href, label, ext }) => (
                  <a
                    key={href}
                    href={href}
                    {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="flex items-center gap-1 text-sm text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    {label} {ext && <ExternalLink className="w-3 h-3" />}
                  </a>
                ))}
              </div>
            </div>

            {/* Legal */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Legal</p>
              <div className="space-y-2.5">
                <Link href="/terms" className="block text-sm text-muted-foreground/60 hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
                <Link href="/privacy" className="block text-sm text-muted-foreground/60 hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>

          <div className="border-t border-border/30 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground/40">
              &copy; {new Date().getFullYear()} SelfHeal. Built for AI engineers.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/carsonlabs/graceful-fail"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground/40 hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <Github className="w-3.5 h-3.5" /> GitHub
              </a>
              <a
                href="https://freedomengineers.tech"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                Freedom Engineers
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
