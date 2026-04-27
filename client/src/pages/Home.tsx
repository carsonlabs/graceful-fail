import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import {
  Zap, Shield, ArrowRight, CheckCircle2,
  AlertTriangle, Clock, KeyRound, Code2,
  Lock, Terminal, Sun, Moon,
  Github, ExternalLink, ChevronRight, Sparkles,
  Bot, Cpu,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useState, useEffect } from "react";

// ─── Data ────────────────────────────────────────────────────────────

const FAILURE_MODES = [
  {
    icon: AlertTriangle,
    stat: "36.7%",
    statLabel: "of production MCP servers",
    title: "Tool call validation errors",
    description:
      "Production MCP servers accept malformed tool calls and return 400s with no actionable detail. Your agent retries the same bad payload until it burns through its token budget.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: Clock,
    stat: "60-sec",
    statLabel: "stalls when 8+ are chained",
    title: "Timeout cascades",
    description:
      "Routine when 8+ MCP servers are chained. One slow upstream poisons every downstream call. Your agent sits idle waiting for a response that's never coming.",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
  },
  {
    icon: KeyRound,
    stat: "Silent",
    statLabel: "token refresh failures",
    title: "Auth drift mid-session",
    description:
      "Your agent keeps sending expired creds. Upstream returns 401 → agent retries → same 401 → burns through the retry budget → customer sees \"agent offline.\"",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
];

const PRICING = [
  {
    name: "Reliability Plan",
    price: "$29",
    period: " / team / mo",
    limit: "Flat fee. Unlimited calls under fair use (10K/mo soft cap).",
    features: [
      "All error categories",
      "Up to 10 developers per team",
      "Slack + email alerts on circuit-open",
      "Priority support",
      "Monthly reliability report",
      "Cancel anytime",
    ],
    cta: "Start 14-day trial",
    ctaHref: "/dashboard",
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "x402 Outcome Pricing",
    price: "$0.003",
    period: " / heal (USDC)",
    limit: "Pay-per-heal via HTTP 402 + Base L2 settlement.",
    features: [
      "Zero subscription, zero auth, zero billing setup",
      "Your agent's wallet IS the API key",
      "Best for high-variance workloads",
      "Agent-to-agent commerce ready",
      "Built on the x402 HTTP spec",
    ],
    cta: "Point your agent at it",
    ctaHref: "/docs",
    highlight: false,
  },
  {
    name: "Hobby",
    price: "$0",
    period: "",
    limit: "500 requests/mo. No credit card.",
    features: [
      "All features, capped volume",
      "1 developer",
      "Community Discord",
      "For testing + personal agents",
    ],
    cta: "Get a key",
    ctaHref: "/dashboard",
    highlight: false,
  },
];

const USE_CASES = [
  {
    icon: Bot,
    title: "LangGraph agents",
    description: "Drop-in integration. 5-minute setup. Works with any LangGraph chain that touches MCP or external APIs.",
    link: "/docs",
    linkLabel: "See the 5-min tutorial",
  },
  {
    icon: Cpu,
    title: "CrewAI crews",
    description: "Existing integration shipped in our SDK. Wrap any Crew's tool calls without changing agent logic.",
    link: "/docs",
    linkLabel: "CrewAI docs",
  },
  {
    icon: Code2,
    title: "Custom agents (OpenAI / Anthropic SDK)",
    description: "HTTP proxy pattern with a 3-line setup. Works with raw httpx/fetch calls to any MCP server or HTTP API.",
    link: "/docs",
    linkLabel: "HTTP setup",
  },
];

const FAQS = [
  {
    q: "Why \"MCP reliability\" framing if SelfHeal started as a generic HTTP proxy?",
    a: "Because that's where the real pain is in 2026. MCP adoption hit 97M monthly SDK installs by March. Production reliability is hovering at 72%. Framework-level solutions (retry, fallback) miss the protocol-boundary failures. SelfHeal operates exactly there, and the same engine covers any HTTP target.",
  },
  {
    q: "What's the difference between x402 and the flat plan?",
    a: "Pricing model, not features. Same engine, same heal quality, same observability. x402 gives agents an autonomous payment rail — their wallet pays per successful heal, no subscription. The flat plan gives teams predictability and a monthly invoice. Pick whichever fits how your team buys software.",
  },
  {
    q: "Is SelfHeal going to survive the MCP reliability tooling wave?",
    a: "Fair question. Sentry Seer ($40/seat), Resolve AI ($1B valuation), NeuBird Hawkeye ($25/investigation) all play near this space. SelfHeal's moat: we run inline at the agent runtime, not post-hoc log analysis. We ship as an npm/PyPI package, not a workflow tool. We price outcome-first. If you want post-hoc error analytics, use Sentry. If you want in-line self-healing that fixes the call before it fails, use SelfHeal.",
  },
  {
    q: "Does SelfHeal see my API keys or credentials?",
    a: "No. Sensitive headers (Authorization, Cookie, API keys in body, OAuth tokens) are automatically stripped before any error reaches the LLM for analysis. The LLM sees the error payload only — never your secrets.",
  },
  {
    q: "What languages and frameworks does SelfHeal support?",
    a: "Official SDKs for Python (pip install graceful-fail) and Node.js/TypeScript (npm install graceful-fail). Both include LangChain and CrewAI integrations. You can also use SelfHeal with any HTTP client by proxying requests through the API endpoint.",
  },
];

const FRAMEWORKS = [
  { name: "LangGraph", text: "LangGraph" },
  { name: "CrewAI", text: "CrewAI" },
  { name: "AutoGen", text: "AutoGen" },
  { name: "Anthropic SDK", text: "Anthropic" },
  { name: "OpenAI SDK", text: "OpenAI" },
  { name: "Raw HTTP", text: "Raw HTTP" },
];

const CODE_BEFORE = `# Agent retries the same broken payload forever
response = httpx.post(tool_url, json=payload)
# 422 Unprocessable Entity.
# Agent burns tokens. You get paged.`;

const CODE_AFTER = `# SelfHeal returns a structured fix on failure
response = httpx.post(
    selfheal_url,
    headers={"X-Destination-URL": tool_url},
    json=payload,
)
# On 4xx/5xx, response.json()["fix"] is
# machine-readable. Agent retries with correction.`;

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

// ─── FAQ accordion item ──────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden transition-colors hover:border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-card/80 transition-colors"
        aria-expanded={open}
      >
        <span className="font-semibold text-foreground text-sm md:text-base">{q}</span>
        <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────

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
              { href: "#failure-modes", label: "Problem" },
              { href: "#how-it-works", label: "How It Works" },
              { href: "#use-cases", label: "Use Cases" },
              { href: "#pricing", label: "Pricing" },
              { href: "#faq", label: "FAQ" },
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-primary/[0.07] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_oklch(0.75_0.18_145_/_0.04)_0%,_transparent_60%)] pointer-events-none" />

        <div className="container relative text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-10 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5" />
            72% of production MCP agents fail a reliability benchmark
            <ChevronRight className="w-3 h-3 opacity-60" />
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground mb-8 leading-[1.1]">
            API errors your agents{" "}
            <br className="hidden sm:block" />
            <span className="text-primary">can fix themselves.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-6 max-w-2xl mx-auto leading-relaxed">
            Drop-in proxy that catches MCP and API failures, analyzes them with an LLM, and returns
            a structured fix your agent can retry with. Timeout cascades, malformed tool calls,
            auth drift &mdash; gone.
          </p>

          <p className="text-sm text-primary/90 mb-10 max-w-xl mx-auto leading-relaxed">
            <span className="font-semibold">Successful calls = free.</span> You only pay credits when SelfHeal actually fixes a failure.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <code className="text-sm font-mono bg-card/80 backdrop-blur border border-border rounded-lg px-5 py-2.5 text-muted-foreground select-all hover:border-primary/40 transition-colors cursor-text">
              pip install <span className="text-primary font-medium">graceful-fail</span>
            </code>
            <code className="text-sm font-mono bg-card/80 backdrop-blur border border-border rounded-lg px-5 py-2.5 text-muted-foreground select-all hover:border-primary/40 transition-colors cursor-text">
              npm install <span className="text-primary font-medium">graceful-fail</span>
            </code>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="gap-2.5 text-base px-10 h-12 shadow-[0_0_30px_oklch(0.75_0.18_145_/_0.35)] hover:shadow-[0_0_40px_oklch(0.75_0.18_145_/_0.5)] transition-shadow"
              onClick={() => {
                const el = document.getElementById("how-it-works");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Install in 30 seconds <ArrowRight className="w-4.5 h-4.5" />
            </Button>
            <Link href="/dashboard/playground">
              <Button variant="outline" size="lg" className="gap-2.5 text-base px-10 h-12 border-border/60">
                <Terminal className="w-4.5 h-4.5" />
                Live Playground
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground/60 mt-5">
            $29/team/mo flat &middot; or pay-per-heal via x402 &middot; or 500 calls free
          </p>
        </div>
      </section>

      {/* ── Framework proof ── */}
      <section className="border-y border-border/50 bg-card/30 py-6 overflow-hidden">
        <div className="container">
          <p className="text-center text-xs text-muted-foreground/50 uppercase tracking-widest font-medium mb-5">
            Works with any MCP-compatible framework
          </p>
          <div className="flex items-center justify-center gap-10 md:gap-16 flex-wrap">
            {FRAMEWORKS.map(({ name, text }) => (
              <span key={name} className="text-sm font-semibold text-muted-foreground/30 tracking-wide">
                {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Failure modes ── */}
      <section id="failure-modes" className="py-24 md:py-32">
        <div className="container">
          <div className="text-center mb-20">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">The problem</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              Three failure modes your framework doesn't catch
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              They happen at the protocol boundary. Retry loops and fallbacks miss them.
              SelfHeal operates exactly there.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {FAILURE_MODES.map(({ icon: Icon, stat, statLabel, title, description, color, bg }) => (
              <div
                key={title}
                className="group relative p-7 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all duration-300"
              >
                <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div className="mb-4">
                  <div className={`text-3xl md:text-4xl font-extrabold ${color} tabular-nums leading-none mb-1`}>
                    {stat}
                  </div>
                  <div className="text-xs text-muted-foreground/70 uppercase tracking-wide">
                    {statLabel}
                  </div>
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-[15px]">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground/70 italic mt-12 max-w-2xl mx-auto">
            These are the failures your framework doesn't catch. They happen at the protocol boundary.
            SelfHeal operates exactly there.
          </p>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="py-16 md:py-20 border-y border-border/50 bg-card/20">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center max-w-4xl mx-auto">
            <AnimatedStat value="~5ms" label="Pass-through latency" />
            <AnimatedStat value="Zero" label="Credentials exposed" />
            <AnimatedStat value="100%" label="Pass-through on success" />
            <AnimatedStat value="$0" label="For successful requests" />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-24 md:py-32">
        <div className="container">
          <div className="text-center mb-20">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">How it works</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              Intercept. Analyze. Return a structured fix.
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              POST through SelfHeal. 2xx pass through free. 4xx/5xx get a machine-readable fix envelope.
            </p>
          </div>

          {/* Flow diagram */}
          <div className="max-w-3xl mx-auto mb-16">
            <pre className="text-xs md:text-sm font-mono text-muted-foreground bg-card/50 border border-border/60 rounded-2xl p-6 md:p-8 leading-relaxed overflow-x-auto whitespace-pre">
{`Agent ──▶ SelfHeal proxy ──▶ MCP server / API
           │
           ▼ on error
        LLM analysis  (credentials stripped)
           │
           ▼
     { retriable, category, fix_diff }
           │
           ▼ agent retries with corrected payload ─▶ success`}
            </pre>
          </div>

          {/* Code comparison */}
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-5 mb-12">
            <div className="rounded-2xl border border-red-500/20 bg-background overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border/50 bg-card/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/40" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                </div>
                <span className="ml-2 text-xs text-red-400/80 font-mono font-medium">before.py</span>
                <span className="ml-auto text-[10px] text-red-400/60 font-medium uppercase tracking-wide">Without SelfHeal</span>
              </div>
              <pre className="p-5 text-[13px] font-mono text-foreground/80 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {CODE_BEFORE}
              </pre>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-background overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border/50 bg-card/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-500/40" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                </div>
                <span className="ml-2 text-xs text-emerald-400/80 font-mono font-medium">after.py</span>
                <span className="ml-auto text-[10px] text-emerald-400/60 font-medium uppercase tracking-wide">With SelfHeal</span>
              </div>
              <pre className="p-5 text-[13px] font-mono text-foreground/80 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {CODE_AFTER}
              </pre>
            </div>
          </div>

          {/* Three bullets */}
          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {[
              { icon: Zap, title: "Zero overhead on success", desc: "2xx/3xx calls pass through with ~5ms added latency." },
              { icon: Shield, title: "Credential-safe", desc: "Authorization / Cookie / API keys stripped before any LLM analysis." },
              { icon: Cpu, title: "Framework-agnostic", desc: "LangGraph, CrewAI, AutoGen, custom agents, or raw HTTP." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-5 rounded-2xl border border-border/60 bg-card/50 flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm mb-1">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 md:py-32 bg-card/20 border-y border-border/50">
        <div className="container">
          <div className="text-center mb-20">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">Pricing</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              Two ways to pay. Same engine.
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              <span className="text-foreground font-medium">x402 for agents, flat-fee for teams.</span> Your choice.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {PRICING.map(({ name, price, period, limit, features, cta, ctaHref, highlight, badge }) => (
              <div
                key={name}
                className={`relative rounded-2xl border p-8 flex flex-col transition-all duration-300 ${
                  highlight
                    ? "border-primary/50 bg-card shadow-[0_0_40px_oklch(0.75_0.18_145_/_0.1)] scale-[1.02]"
                    : "border-border/60 bg-card/50 hover:border-border"
                }`}
              >
                {highlight && badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div className="text-[10px] font-bold text-primary-foreground bg-primary rounded-full px-4 py-1 shadow-[0_0_16px_oklch(0.75_0.18_145_/_0.4)] uppercase tracking-wider">
                      {badge}
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

      {/* ── Use cases ── */}
      <section id="use-cases" className="py-24 md:py-32">
        <div className="container">
          <div className="text-center mb-20">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">Use cases</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              Ship the integration today
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Three setups cover 90% of production agent stacks.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {USE_CASES.map(({ icon: Icon, title, description, link, linkLabel }) => (
              <div
                key={title}
                className="group relative p-7 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all duration-300 flex flex-col"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-3 text-base">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">{description}</p>
                <Link href={link} className="text-sm text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1 transition-colors">
                  {linkLabel} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built-in safety ── */}
      <section className="py-20 md:py-24 bg-card/20 border-y border-border/50">
        <div className="container max-w-3xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl md:text-4xl font-bold mb-5 tracking-tight">
            Credentials never leave the proxy layer.
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Sensitive headers (Authorization, Cookie, API keys in body, OAuth tokens) are
            automatically stripped before any error reaches the LLM for analysis. The LLM
            sees the error payload only — never your secrets.
          </p>
        </div>
      </section>

      {/* ── Developer proof ── */}
      <section className="py-24 md:py-28">
        <div className="container">
          <div className="text-center mb-14">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">Developer proof</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Built in the open, shipping under MIT
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            <a
              href="https://pypi.org/project/graceful-fail/"
              target="_blank"
              rel="noopener noreferrer"
              className="group p-6 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all duration-300"
            >
              <div className="text-2xl md:text-3xl font-extrabold text-primary mb-2">PyPI + npm</div>
              <div className="text-sm text-muted-foreground mb-3">
                <code className="text-xs bg-muted/30 px-2 py-0.5 rounded">graceful-fail</code> — Python &amp; Node SDKs, public weekly install stats.
              </div>
              <div className="text-xs text-primary group-hover:text-primary/80 font-medium flex items-center gap-1">
                View pypistats <ExternalLink className="w-3 h-3" />
              </div>
            </a>
            <div className="p-6 rounded-2xl border border-border/60 bg-card/50">
              <div className="text-2xl md:text-3xl font-extrabold text-primary mb-2">First production x402</div>
              <div className="text-sm text-muted-foreground mb-3">
                Integration on HTTP 402 + Base L2 USDC. Agent pays per successful heal.
              </div>
              <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                Built on the x402 HTTP spec
              </div>
            </div>
            <a
              href="https://github.com/carsonlabs/graceful-fail"
              target="_blank"
              rel="noopener noreferrer"
              className="group p-6 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all duration-300"
            >
              <div className="text-2xl md:text-3xl font-extrabold text-primary mb-2 flex items-center gap-2">
                <Github className="w-6 h-6" /> MIT
              </div>
              <div className="text-sm text-muted-foreground mb-3">
                SDKs open source, closed-source proxy. Inspect the heal path before you ship.
              </div>
              <div className="text-xs text-primary group-hover:text-primary/80 font-medium flex items-center gap-1">
                View on GitHub <ExternalLink className="w-3 h-3" />
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-24 md:py-32 bg-card/20 border-y border-border/50">
        <div className="container max-w-3xl">
          <div className="text-center mb-14">
            <p className="text-xs text-primary font-semibold uppercase tracking-widest mb-4">FAQ</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
              Questions worth asking
            </h2>
          </div>
          <div className="space-y-3">
            {FAQS.map(({ q, a }) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-28 md:py-36 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/[0.05] rounded-full blur-[100px] pointer-events-none" />
        <div className="container relative text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
            Your MCP agent just hit a 422.{" "}
            <br className="hidden sm:block" />
            <span className="text-primary">Does it crash — or fix itself?</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
            Stop babysitting agent retries. SelfHeal gives them a structured fix before the retry budget burns.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="gap-2.5 text-base px-12 h-13 shadow-[0_0_30px_oklch(0.75_0.18_145_/_0.35)] hover:shadow-[0_0_40px_oklch(0.75_0.18_145_/_0.5)] transition-shadow"
              onClick={() => (window.location.href = ctaUrl)}
            >
              Start 14-day trial <ArrowRight className="w-4.5 h-4.5" />
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
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <span className="font-bold text-sm">SelfHeal</span>
              </div>
              <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[220px]">
                MCP reliability layer for production AI agents. Drop-in proxy, structured fixes, pay-per-heal.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Product</p>
              <div className="space-y-2.5">
                {[
                  { href: "#failure-modes", label: "The problem" },
                  { href: "#how-it-works", label: "How it works" },
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
              SelfHeal is built by{" "}
              <a href="https://freedomengineers.tech" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Freedom Engineers
              </a>
              {" "}— a micro-SaaS studio shipping picks-and-shovels for the AI agent economy.
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
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
