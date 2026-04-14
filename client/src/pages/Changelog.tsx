import { Link } from "wouter";
import { Zap, ChevronRight, Sparkles, Wrench, Shield, Rocket } from "lucide-react";

type ChangeType = "feature" | "fix" | "security" | "improvement";

interface ChangeEntry {
  type: ChangeType;
  text: string;
}

interface Release {
  version: string;
  date: string;
  tag?: "latest" | "major";
  summary: string;
  changes: ChangeEntry[];
}

const TYPE_CONFIG: Record<ChangeType, { label: string; color: string; icon: React.ElementType }> = {
  feature: { label: "New", color: "text-primary bg-primary/10 border-primary/20", icon: Sparkles },
  improvement: { label: "Improved", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: Rocket },
  fix: { label: "Fix", color: "text-amber-400 bg-amber-400/10 border-amber-400/20", icon: Wrench },
  security: { label: "Security", color: "text-red-400 bg-red-400/10 border-red-400/20", icon: Shield },
};

const RELEASES: Release[] = [
  {
    version: "3.0.0",
    date: "April 14, 2026",
    tag: "latest",
    summary: "x402 outcome-based pricing, response normalization, and published SDKs — SelfHeal is now fully agent-native with USDC micropayments.",
    changes: [
      { type: "feature", text: "x402 outcome-based pricing — agents pay $0.001-$0.005 USDC per successful heal via x402 micropayments on Base. No API keys, no subscriptions, no accounts." },
      { type: "feature", text: "Six new endpoints: POST /api/x402/proxy, POST /api/x402/heal, GET /api/x402/pricing, GET /api/x402/usage, GET /metrics (Prometheus), GET /health" },
      { type: "feature", text: "Response normalization — send optional target_schema in the request body. SelfHeal normalizes the API response to match your schema. Already-compliant responses are free." },
      { type: "feature", text: "Prometheus metrics — counters, histograms, and gauges for proxy requests, heals, x402 payments, LLM token usage, latency, and cache performance" },
      { type: "feature", text: "Webhook alerting — automatic alerts on traffic spikes (>5x baseline), daily LLM cost overruns, and low heal success rates" },
      { type: "feature", text: "Response caching — TTL-based cache for successful GET proxy responses, reducing origin load on repeated requests" },
      { type: "feature", text: "Claude native LLM provider — hosted mode with prompt caching when ANTHROPIC_API_KEY is set, cutting LLM costs ~90% on repeated provider patterns" },
      { type: "feature", text: "Published SDKs v0.4.0 on npm and PyPI with native x402 support, LangChain and CrewAI integrations" },
      { type: "improvement", text: "Landing page, docs, and README fully rewritten for x402 outcome-based model" },
      { type: "improvement", text: "OpenAPI 3.1 spec updated with all x402 endpoints, request/response schemas, and payment spec types" },
      { type: "security", text: "x402 payment verification via facilitator — payments only settle on successful heal. Failed analyses are never charged." },
    ],
  },
  {
    version: "2.0.0",
    date: "March 29, 2026",
    summary: "Auto-retry with fixed payload and Sentry integration — SelfHeal now fixes and retries failed requests automatically.",
    changes: [
      { type: "feature", text: "Auto-retry with fixed payload — when the LLM diagnoses a fixable error, SelfHeal applies the suggested diff and retries the request automatically. Successful retries return the API response directly with a selfheal_auto_fixed flag." },
      { type: "feature", text: "Sentry inbound webhook — connect your Sentry project to SelfHeal and get LLM-powered analysis for every new exception, including root cause and actionable fix" },
      { type: "feature", text: "Slack alert integration — receive real-time notifications on non-retriable errors in your Slack channel" },
      { type: "feature", text: "X-Auto-Retry header — opt out of auto-retry per request with X-Auto-Retry: false" },
      { type: "improvement", text: "Request logs now track auto-retry attempts, retry status codes, and success/failure" },
      { type: "security", text: "SSRF protection expanded to block all RFC 1918 ranges, link-local, and IPv6 loopback addresses" },
    ],
  },
  {
    version: "1.5.1",
    date: "March 29, 2026",
    summary: "API key management and polish: inline rename, auto-populated code snippets, and billing cleanup.",
    changes: [
      { type: "feature", text: "Inline API key rename — hover any key name to edit it in place (Enter to save, Escape to cancel)" },
      { type: "improvement", text: "API Keys and Dashboard code snippets now auto-populate with your actual API key prefix" },
      { type: "improvement", text: "Removed test payment card notice from Billing page" },
    ],
  },
  {
    version: "1.5.0",
    date: "March 29, 2026",
    summary: "Dashboard UX overhaul: clickable request logs with drill-down detail view, analytics fixes, and quality-of-life improvements.",
    changes: [
      { type: "feature", text: "Request log drill-down — click any row to expand full request details, LLM analysis, error category, and retriable status" },
      { type: "fix", text: "Analytics date grouping — monthly chart and table now correctly aggregate across all API keys instead of showing duplicate rows" },
      { type: "fix", text: "Status page stat cards no longer show dashes when value is zero — displays \"0\" for counts and \"N/A\" for latencies with no data" },
      { type: "improvement", text: "Copy-to-clipboard button on Dashboard Quick Start code block with auto-populated API key prefix" },
      { type: "improvement", text: "Renamed \"Success Rate\" to \"Pass-through Rate\" across Dashboard and Analytics for clarity" },
    ],
  },
  {
    version: "1.4.0",
    date: "March 26, 2026",
    summary: "Developer experience round: changelog, onboarding checklist, and CSV log export.",
    changes: [
      { type: "feature", text: "Public /changelog page with version history and release notes" },
      { type: "feature", text: "In-dashboard onboarding checklist to guide new users to first value" },
      { type: "feature", text: "CSV export button on Request Logs page with active filter support" },
    ],
  },
  {
    version: "1.3.0",
    date: "March 26, 2026",
    summary: "Discoverability and integration round: OpenAPI spec, shareable Playground links, and public status page.",
    changes: [
      { type: "feature", text: "GET /api/openapi.json — dynamic OpenAPI 3.1 spec for Postman/Insomnia import" },
      { type: "feature", text: "Playground URL query param sync — share pre-filled requests via link" },
      { type: "feature", text: "Public /status page with live 24h metrics, operational badge, and 30s auto-refresh" },
      { type: "improvement", text: "Docs page now includes OpenAPI download button and import instructions" },
    ],
  },
  {
    version: "1.2.0",
    date: "March 26, 2026",
    summary: "Documentation, alerts, and Playground quality-of-life improvements.",
    changes: [
      { type: "feature", text: "Public /docs page with interactive code snippet generator (curl, Python, Node.js, TypeScript)" },
      { type: "feature", text: "Email alert via owner notification when all 3 webhook delivery retries are exhausted" },
      { type: "feature", text: "Copy as cURL button in Playground — generates a complete shell command from current request state" },
      { type: "improvement", text: "Docs linked from landing page nav and dashboard sidebar under Resources" },
    ],
  },
  {
    version: "1.1.0",
    date: "March 26, 2026",
    summary: "Billing, webhooks, and live API playground.",
    changes: [
      { type: "feature", text: "Stripe billing — Pro ($149/mo) and Agency ($349/mo) checkout with customer portal" },
      { type: "feature", text: "Webhook notifications — HMAC-signed delivery to any URL on rate_limit or non_retriable_error events" },
      { type: "feature", text: "Webhook delivery log with retry counts and HTTP status per attempt" },
      { type: "feature", text: "Live API Playground with real-time LLM error analysis, diff viewer, and copy-corrected-payload" },
      { type: "security", text: "Webhook endpoint secrets shown only once at creation; stored as SHA-256 hash" },
    ],
  },
  {
    version: "1.0.0",
    date: "March 26, 2026",
    tag: "major",
    summary: "Initial release of SelfHeal — the intelligent API proxy for AI agents.",
    changes: [
      { type: "feature", text: "POST /api/proxy — forward any HTTP request to any destination API" },
      { type: "feature", text: "Zero-overhead pass-through for 2xx/3xx responses" },
      { type: "feature", text: "LLM-powered error analysis for 4xx/5xx — returns is_retriable, actionable_fix_for_agent, and suggested_payload_diff" },
      { type: "feature", text: "API key authentication with SHA-256 hashing — keys shown only once at creation" },
      { type: "feature", text: "Three-tier rate limiting: Hobby (500/mo), Pro (10k/mo), Agency (50k/mo)" },
      { type: "feature", text: "Credits only consumed on intercepted errors — pass-through requests are free" },
      { type: "feature", text: "Developer dashboard: overview stats, API key management, request logs, usage analytics" },
      { type: "security", text: "Sensitive headers (Authorization, Cookie, API keys) stripped before LLM analysis" },
    ],
  },
];

function TypeBadge({ type }: { type: ChangeType }) {
  const { label, color, icon: Icon } = TYPE_CONFIG[type];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

export default function Changelog() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">SelfHeal</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Changelog</span>
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/status" className="hover:text-foreground transition-colors">Status</Link>
            <Link href="/dashboard" className="hover:text-foreground transition-colors text-foreground font-medium">Dashboard</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-14">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Changelog</h1>
          <p className="text-muted-foreground text-lg">
            Every release, every fix, every improvement — in one place.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border hidden md:block" />

          <div className="space-y-14">
            {RELEASES.map((release) => (
              <div key={release.version} className="md:pl-10 relative">
                {/* Timeline dot */}
                <div className="hidden md:block absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-primary bg-background" />

                {/* Header */}
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className="text-xl font-bold text-foreground font-mono">v{release.version}</span>
                  {release.tag === "latest" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                      Latest
                    </span>
                  )}
                  {release.tag === "major" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Initial Release
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">{release.date}</span>
                </div>

                <p className="text-sm text-muted-foreground mb-5 max-w-2xl">{release.summary}</p>

                {/* Changes */}
                <div className="space-y-2.5">
                  {release.changes.map((change, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <TypeBadge type={change.type} />
                      <span className="text-sm text-foreground leading-relaxed">{change.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-20 pt-10 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            Have a feature request or found a bug?{" "}
            <Link href="/docs" className="text-primary hover:underline">
              Read the docs
            </Link>{" "}
            or{" "}
            <Link href="/dashboard/playground" className="text-primary hover:underline">
              try the Playground
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
