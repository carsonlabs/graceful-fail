import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Zap, CheckCircle2, AlertTriangle, Clock, Activity, BarChart2, ArrowUpRight } from "lucide-react";

function MetricCard({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-5">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">{label}</p>
      <div className="flex items-end gap-1.5">
        <span className="text-3xl font-bold text-foreground tabular-nums">
          {value === null ? "—" : value}
        </span>
        {unit && <span className="text-sm text-muted-foreground mb-0.5">{unit}</span>}
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: "operational" | "degraded" | "loading" }) {
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-muted/30 text-sm text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
        Checking status…
      </div>
    );
  }
  if (status === "operational") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-400 font-medium">
        <CheckCircle2 className="w-4 h-4" />
        All Systems Operational
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/30 bg-amber-500/10 text-sm text-amber-400 font-medium">
      <AlertTriangle className="w-4 h-4" />
      Degraded Performance
    </div>
  );
}

const COMPONENTS = [
  { name: "API Proxy Endpoint", description: "POST /api/proxy — request forwarding and interception" },
  { name: "LLM Analysis Engine", description: "Error interpretation and structured fix generation" },
  { name: "Authentication Service", description: "API key validation and rate limiting" },
  { name: "Developer Dashboard", description: "Web UI, API key management, and request logs" },
  { name: "Webhook Delivery", description: "Event dispatch and retry engine" },
];

export default function StatusPage() {
  const { data, isLoading } = trpc.status.get.useQuery(undefined, {
    refetchInterval: 30_000, // refresh every 30 seconds
  });

  const systemStatus = isLoading ? "loading" : (data?.status ?? "operational");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Graceful Fail</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/status" className="text-foreground font-medium">Status</Link>
          </nav>
        </div>
      </header>

      <main className="container py-16 max-w-4xl">
        {/* Hero */}
        <div className="mb-12 flex flex-col items-center text-center gap-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Activity className="w-4 h-4" />
            <span>Live system status — refreshes every 30 seconds</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">System Status</h1>
          <StatusBadge status={systemStatus} />
        </div>

        {/* Metrics */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            Last 24 Hours
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Total Requests"
              value={isLoading ? null : (data?.totalRequests24h ?? 0).toLocaleString()}
              sub="Proxied in the last 24h"
            />
            <MetricCard
              label="Intercepted Errors"
              value={isLoading ? null : (data?.interceptedRequests24h ?? 0).toLocaleString()}
              sub="4xx/5xx responses analyzed"
            />
            <MetricCard
              label="Avg Proxy Latency"
              value={isLoading ? null : (data?.avgProxyLatencyMs ?? null)}
              unit={data?.avgProxyLatencyMs != null ? "ms" : undefined}
              sub="End-to-end round trip"
            />
            <MetricCard
              label="Avg LLM Analysis"
              value={isLoading ? null : (data?.avgLlmLatencyMs ?? null)}
              unit={data?.avgLlmLatencyMs != null ? "ms" : undefined}
              sub="Error interpretation time"
            />
          </div>
          {!isLoading && data && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Interception rate: <span className="text-foreground font-medium">{data.interceptionRate}%</span> of requests triggered LLM analysis in the last 24 hours.
            </p>
          )}
        </section>

        {/* Component Status */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Components
          </h2>
          <div className="rounded-xl border border-border overflow-hidden">
            {COMPONENTS.map((c, i) => (
              <div
                key={c.name}
                className={`flex items-center justify-between px-5 py-4 ${
                  i < COMPONENTS.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 shrink-0 ml-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Operational
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Uptime note */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Response Time Thresholds
          </h2>
          <div className="rounded-xl border border-border overflow-hidden">
            {[
              { label: "Proxy latency (pass-through)", good: "< 500ms", degraded: "> 3000ms" },
              { label: "Proxy latency (intercepted)", good: "< 2000ms", degraded: "> 5000ms" },
              { label: "LLM analysis time", good: "< 1500ms", degraded: "> 4000ms" },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                className={`grid grid-cols-3 px-5 py-3 text-sm ${
                  i < arr.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <span className="text-foreground">{row.label}</span>
                <span className="text-emerald-400 text-xs font-mono">{row.good}</span>
                <span className="text-amber-400 text-xs font-mono">{row.degraded}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 px-5 py-2 text-xs text-muted-foreground">
            <span>Metric</span>
            <span className="text-emerald-400/60">Operational</span>
            <span className="text-amber-400/60">Degraded</span>
          </div>
        </section>

        {/* Footer CTA */}
        <div className="text-center border-t border-border pt-10">
          <p className="text-sm text-muted-foreground mb-4">
            Experiencing an issue not reflected here?
          </p>
          <Link href="/docs">
            <span className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
              View API Documentation <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
