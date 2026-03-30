import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, AlertTriangle, CheckCircle2, XCircle,
  Shield, Zap, Code2, ExternalLink, ChevronDown, ChevronUp
} from "lucide-react";
import { getLoginUrl } from "@/const";

interface Antipattern {
  name: string;
  description: string;
  severity: "High" | "Medium" | "Low";
  count: number;
  exampleFile: string;
  exampleLine: string;
}

interface RepoScan {
  repo: string;
  fullName: string;
  stars: number;
  language: string | null;
  description: string | null;
  sdksFound: string[];
  antipatterns: Antipattern[];
  filesScanned: number;
  aiFilesFound: number;
  resilienceScore: number;
}

interface AuditData {
  name: string;
  slug: string;
  repos: RepoScan[];
  totalStars: number;
  totalAIFiles: number;
  sdksUsed: string[];
  totalHighSeverity: number;
  totalMediumSeverity: number;
  totalLowSeverity: number;
  overallScore: number;
  estimatedFailureRate: string;
  estimatedCostPerMonth: string;
}

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#eab308" : "#ef4444";
  const label = score >= 70 ? "Good" : score >= 40 ? "Needs Work" : "Critical";

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
        <circle
          cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 70 70)"
          className="transition-all duration-1000 ease-out"
        />
        <text x="70" y="65" textAnchor="middle" className="fill-foreground" fontSize="36" fontWeight="bold">{score}</text>
        <text x="70" y="85" textAnchor="middle" fill={color} fontSize="12" fontWeight="600">{label}</text>
      </svg>
      <span className="text-xs text-muted-foreground">Resilience Score</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors = {
    High: "bg-red-500/10 text-red-500 border-red-500/20",
    Medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    Low: "bg-green-500/10 text-green-500 border-green-500/20",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colors[severity as keyof typeof colors] ?? colors.Low}`}>
      {severity}
    </span>
  );
}

export default function AuditReport() {
  const [, params] = useRoute("/audit/:slug");
  const slug = params?.slug;
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/audits/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("Audit report not found."));
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Report Not Found</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link href="/"><Button>Back to Home</Button></Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading audit report...</p>
        </div>
      </div>
    );
  }

  const totalIssues = data.totalHighSeverity + data.totalMediumSeverity + data.totalLowSeverity;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="container flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">SelfHeal</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">AI Agent Resilience Audit</span>
            <Button size="sm" className="gap-1.5" onClick={() => (window.location.href = getLoginUrl())}>
              Try Free <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container max-w-4xl py-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-12">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <Shield className="w-3.5 h-3.5 text-primary" />
              AI Agent Resilience Audit
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{data.name}</h1>
            <p className="text-muted-foreground">
              {data.repos.length} repo{data.repos.length > 1 ? "s" : ""} scanned &middot; {data.totalAIFiles} AI files analyzed &middot; {data.sdksUsed.length} SDKs detected
            </p>
          </div>
          <ScoreRing score={data.overallScore} />
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { value: data.totalHighSeverity, label: "High Severity", color: "text-red-500", icon: XCircle },
            { value: data.totalMediumSeverity, label: "Medium Severity", color: "text-yellow-500", icon: AlertTriangle },
            { value: data.totalLowSeverity, label: "Low Severity", color: "text-green-500", icon: CheckCircle2 },
            { value: totalIssues, label: "Total Issues", color: "text-foreground", icon: Code2 },
          ].map(({ value, label, color, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <span className={`text-2xl font-bold ${color}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* Impact estimate */}
        <div className="rounded-xl border border-border bg-card p-6 mb-10">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Estimated Impact</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Failure Rate</div>
              <div className="text-xl font-bold text-foreground">{data.estimatedFailureRate}</div>
              <div className="text-xs text-muted-foreground">of API calls in production</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Estimated Cost</div>
              <div className="text-xl font-bold text-foreground">{data.estimatedCostPerMonth}</div>
              <div className="text-xs text-muted-foreground">per month in wasted compute</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">SDKs Detected</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {data.sdksUsed.map((sdk) => (
                  <span key={sdk} className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">{sdk}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Per-repo findings */}
        <h2 className="text-xl font-bold mb-4">Findings by Repository</h2>
        <div className="space-y-4 mb-12">
          {data.repos.map((repo) => {
            const isExpanded = expandedRepo === repo.fullName;
            return (
              <div key={repo.fullName} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedRepo(isExpanded ? null : repo.fullName)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground truncate">{repo.fullName}</span>
                      <a
                        href={`https://github.com/${repo.fullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{repo.language}</span>
                      <span>{repo.stars.toLocaleString()} stars</span>
                      <span>{repo.aiFilesFound} AI files</span>
                      <span>Score: {repo.resilienceScore}/100</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    {repo.antipatterns.filter((a) => a.severity === "High").length > 0 && (
                      <span className="text-xs text-red-500 font-medium">
                        {repo.antipatterns.filter((a) => a.severity === "High").reduce((s, a) => s + a.count, 0)} high
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border">
                    {repo.description && (
                      <p className="text-sm text-muted-foreground px-5 pt-4">{repo.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 px-5 pt-3">
                      {repo.sdksFound.map((sdk) => (
                        <span key={sdk} className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">{sdk}</span>
                      ))}
                    </div>

                    {repo.antipatterns.length === 0 ? (
                      <div className="p-5 text-sm text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        No issues detected in scanned files.
                      </div>
                    ) : (
                      <div className="divide-y divide-border mt-3">
                        {repo.antipatterns
                          .sort((a, b) => {
                            const sev = { High: 0, Medium: 1, Low: 2 };
                            return sev[a.severity] - sev[b.severity];
                          })
                          .map((ap, i) => (
                          <div key={i} className="px-5 py-4">
                            <div className="flex items-start justify-between gap-4 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-foreground">{ap.name}</span>
                                <SeverityBadge severity={ap.severity} />
                              </div>
                              <span className="text-sm font-mono text-muted-foreground shrink-0">{ap.count}x</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{ap.description}</p>
                            {ap.exampleFile && (
                              <div className="rounded-lg bg-[#0d1117] border border-border p-3 overflow-x-auto">
                                <div className="text-[10px] text-muted-foreground mb-1.5 font-mono">{ap.exampleFile}</div>
                                {ap.exampleLine && (
                                  <code className="text-xs text-[#e6edf3] font-mono">{ap.exampleLine}</code>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Fix these issues automatically</h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            SelfHeal sits between your agents and any API. Failed calls get intercepted, analyzed, and returned with
            structured recovery instructions — no code changes needed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="gap-2" onClick={() => (window.location.href = getLoginUrl())}>
              Start Free — 500 requests/month <ArrowRight className="w-4 h-4" />
            </Button>
            <Link href="/docs">
              <Button variant="outline" size="lg">Read the Docs</Button>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-4 mt-4">
            <code className="text-xs font-mono bg-card border border-border rounded-lg px-3 py-1.5 text-muted-foreground">
              pip install <span className="text-primary">graceful-fail</span>
            </code>
            <code className="text-xs font-mono bg-card border border-border rounded-lg px-3 py-1.5 text-muted-foreground">
              npm install <span className="text-primary">graceful-fail</span>
            </code>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground">
          <p>This report was generated by <a href="https://selfheal.dev" className="text-primary hover:underline">SelfHeal</a>'s
          automated resilience scanner. Data sourced from public GitHub repositories.</p>
          <p className="mt-1">Questions? <a href="https://cal.com/carsonroell/selfheal" className="text-primary hover:underline">Book a call</a></p>
        </div>
      </div>
    </div>
  );
}
