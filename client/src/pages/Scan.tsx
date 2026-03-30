import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, AlertTriangle, CheckCircle2, XCircle,
  Shield, Zap, Code2, ExternalLink, ChevronDown, ChevronUp,
  Search, Loader2, Github
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

interface ScanResult {
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
      <svg width="120" height="120" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
        <circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 70 70)" className="transition-all duration-1000 ease-out" />
        <text x="70" y="65" textAnchor="middle" className="fill-foreground" fontSize="36" fontWeight="bold">{score}</text>
        <text x="70" y="85" textAnchor="middle" fill={color} fontSize="12" fontWeight="600">{label}</text>
      </svg>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    High: "bg-red-500/10 text-red-500 border-red-500/20",
    Medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    Low: "bg-green-500/10 text-green-500 border-green-500/20",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colors[severity] ?? colors.Low}`}>
      {severity}
    </span>
  );
}

export default function Scan() {
  const [repo, setRepo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);

  const handleScan = async () => {
    const clean = repo.trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "");

    if (!clean.includes("/")) {
      setError("Enter a repo in owner/repo format (e.g. langchain-ai/langchain)");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(data);
      setExpandedRepo(data.repos[0]?.fullName ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
          <Button size="sm" className="gap-1.5" onClick={() => (window.location.href = getLoginUrl())}>
            Try Free <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      <div className="container max-w-3xl py-16">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-6">
            <Shield className="w-3.5 h-3.5" />
            Free AI Agent Resilience Scanner
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            How resilient is your<br />
            <span className="text-primary">AI agent code?</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Paste a GitHub repo URL. We'll scan for error handling gaps, missing retries, hardcoded models,
            and other patterns that cause agent failures in production.
          </p>
        </div>

        {/* Input */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Github className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && handleScan()}
              placeholder="owner/repo or https://github.com/owner/repo"
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              disabled={loading}
            />
          </div>
          <Button
            size="lg"
            className="gap-2 px-6 shrink-0"
            onClick={handleScan}
            disabled={loading || !repo.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Scan Repo
              </>
            )}
          </Button>
        </div>

        {loading && (
          <div className="text-center py-16">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground mb-1">Scanning repository...</p>
            <p className="text-xs text-muted-foreground">This takes 30-60 seconds. We're searching for AI SDK usage and analyzing error handling patterns.</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3 mb-8">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Scan failed</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-8 mt-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6 rounded-xl border border-border bg-card">
              <div>
                <h2 className="text-2xl font-bold mb-1">{result.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {result.totalAIFiles} AI files scanned &middot; {result.sdksUsed.length} SDKs detected &middot;{" "}
                  {result.totalHighSeverity + result.totalMediumSeverity + result.totalLowSeverity} issues found
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {result.sdksUsed.map((sdk) => (
                    <span key={sdk} className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">{sdk}</span>
                  ))}
                </div>
              </div>
              <ScoreRing score={result.overallScore} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { value: result.totalHighSeverity, label: "High", color: "text-red-500", icon: XCircle },
                { value: result.totalMediumSeverity, label: "Medium", color: "text-yellow-500", icon: AlertTriangle },
                { value: result.totalLowSeverity, label: "Low", color: "text-green-500", icon: CheckCircle2 },
                { value: result.estimatedFailureRate, label: "Est. Failure Rate", color: "text-foreground", icon: Code2 },
              ].map(({ value, label, color, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                  </div>
                  <span className={`text-xl font-bold ${color}`}>{value}</span>
                </div>
              ))}
            </div>

            {/* Findings */}
            {result.repos.map((scan) => (
              <div key={scan.fullName} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedRepo(expandedRepo === scan.fullName ? null : scan.fullName)}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{scan.fullName}</span>
                      <a href={`https://github.com/${scan.fullName}`} target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {scan.language} &middot; {scan.stars.toLocaleString()} stars &middot; Score: {scan.resilienceScore}/100
                    </span>
                  </div>
                  {expandedRepo === scan.fullName ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {expandedRepo === scan.fullName && (
                  <div className="border-t border-border divide-y divide-border">
                    {scan.antipatterns.length === 0 ? (
                      <div className="p-5 text-sm text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        No issues detected. Nice work!
                      </div>
                    ) : (
                      scan.antipatterns
                        .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.severity] - { High: 0, Medium: 1, Low: 2 }[b.severity]))
                        .map((ap, i) => (
                        <div key={i} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-4 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{ap.name}</span>
                              <SeverityBadge severity={ap.severity} />
                            </div>
                            <span className="text-sm font-mono text-muted-foreground shrink-0">{ap.count}x</span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{ap.description}</p>
                          {ap.exampleFile && (
                            <div className="rounded-lg bg-[#0d1117] border border-border p-3 overflow-x-auto">
                              <div className="text-[10px] text-muted-foreground mb-1 font-mono">{ap.exampleFile}</div>
                              {ap.exampleLine && <code className="text-xs text-[#e6edf3] font-mono">{ap.exampleLine}</code>}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Share + CTA */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-2">Share this report</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`https://selfheal.dev/audit/${result.slug}`}
                    className="flex-1 text-xs font-mono bg-background border border-border rounded-lg px-3 py-2 text-muted-foreground"
                    onClick={(e) => { (e.target as HTMLInputElement).select(); navigator.clipboard.writeText(`https://selfheal.dev/audit/${result.slug}`); }}
                  />
                  <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`https://selfheal.dev/audit/${result.slug}`)}>
                    Copy
                  </Button>
                </div>
              </div>
              <div className="flex-1 rounded-xl border border-primary/30 bg-primary/5 p-5">
                <h3 className="text-sm font-semibold mb-2">Fix these automatically</h3>
                <p className="text-xs text-muted-foreground mb-3">SelfHeal intercepts failed API calls and returns structured fix instructions.</p>
                <Button size="sm" className="gap-1.5" onClick={() => (window.location.href = getLoginUrl())}>
                  Start Free <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Examples when no result */}
        {!result && !loading && !error && (
          <div className="mt-12">
            <p className="text-xs text-muted-foreground text-center mb-4">Try one of these:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {["langchain-ai/langchain", "firecrawl/firecrawl", "mem0ai/mem0", "julep-ai/julep"].map((r) => (
                <button
                  key={r}
                  className="text-xs font-mono bg-card border border-border rounded-lg px-3 py-1.5 text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                  onClick={() => { setRepo(r); }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
