import { Button } from "@/components/ui/button";
import { Link, useRoute } from "wouter";
import { useEffect, useState } from "react";
import {
  Zap,
  ArrowRight,
  CheckCircle2,
  Mail,
  Loader2,
  Sun,
  Moon,
  Github,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface ScanSummary {
  scanId: string;
  apiCount: number;
  avgWastePercent: number;
  monthlyWasteUsd: number;
  platform?: string;
  timestamp?: string;
}

export default function LlmTaxScan() {
  const [, params] = useRoute<{ scanId: string }>("/llm-tax/r/:scanId");
  const scanId = params?.scanId ?? "";
  const { theme, toggleTheme } = useTheme();

  const [scan, setScan] = useState<ScanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [email, setEmail] = useState("");
  const [claimStatus, setClaimStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;
    fetch(`/api/llm-tax/scan/${encodeURIComponent(scanId)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as ScanSummary;
        setScan(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setNotFound(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || claimStatus === "submitting") return;
    setClaimStatus("submitting");
    setClaimError(null);
    try {
      const res = await fetch(`/api/llm-tax/scan/${encodeURIComponent(scanId)}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClaimError(data.error || "Could not save. Please try again.");
        setClaimStatus("error");
        return;
      }
      setClaimStatus("success");
    } catch {
      setClaimError("Network error. Please try again.");
      setClaimStatus("error");
    }
  }

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
              href="/llm-tax"
              className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              llm-tax
            </Link>
            <Link
              href="/docs"
              className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Docs
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
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <Github className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      <section className="container max-w-2xl mx-auto py-16 md:py-24">
        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading scan {scanId}...</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Scan not found yet</h1>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              We couldn&apos;t find a scan with ID <code className="font-mono text-foreground">{scanId}</code>. Either
              it expired (we keep anonymized scans for 30 days) or the scan was just submitted &mdash; try refreshing in
              a few seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/llm-tax">
                <Button variant="outline" className="gap-1.5">
                  See what llm-tax does
                </Button>
              </Link>
              <Link href="/">
                <Button className="gap-1.5">
                  Go to SelfHeal home <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {!loading && scan && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-6 backdrop-blur-sm">
                <Sparkles className="w-3.5 h-3.5" />
                Scan #{scan.scanId}
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4 leading-[1.15]">
                Your codebase is leaking{" "}
                <span className="text-primary">${scan.monthlyWasteUsd.toFixed(2)}/mo</span>
                <br />
                in LLM tax.
              </h1>
              <p className="text-muted-foreground leading-relaxed max-w-xl mx-auto">
                Across {scan.apiCount} API call{scan.apiCount === 1 ? "" : "s"}, your average response is{" "}
                <span className="text-foreground font-semibold">{scan.avgWastePercent}% waste</span> &mdash; tokens
                your agent never reads but you still pay for.
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-xl border border-border bg-card p-5 text-center">
                <div className="text-2xl font-bold text-foreground">{scan.apiCount}</div>
                <div className="text-xs text-muted-foreground mt-1">APIs scanned</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 text-center">
                <div className="text-2xl font-bold text-amber-400">{scan.avgWastePercent}%</div>
                <div className="text-xs text-muted-foreground mt-1">Avg waste</div>
              </div>
              <div className="rounded-xl border border-primary/40 bg-primary/[0.03] p-5 text-center">
                <div className="text-2xl font-bold text-primary">${scan.monthlyWasteUsd.toFixed(0)}</div>
                <div className="text-xs text-muted-foreground mt-1">$/mo wasted</div>
              </div>
            </div>

            {/* Claim form */}
            {claimStatus === "success" ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                <h2 className="text-lg font-semibold mb-1">Locked in.</h2>
                <p className="text-sm text-muted-foreground">
                  Your scan is saved at this URL forever. We&apos;ll send you one email when SelfHeal ships
                  normalize-by-default for your top API host.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleClaim}
                className="rounded-xl border border-border bg-card p-6 space-y-4"
              >
                <div>
                  <h2 className="text-lg font-semibold mb-1">Claim this scan</h2>
                  <p className="text-sm text-muted-foreground">
                    Lock in this URL so it doesn&apos;t expire, and get one email when SelfHeal can fix your
                    worst-offending API automatically.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      disabled={claimStatus === "submitting"}
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-50"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={claimStatus === "submitting" || !email.trim()}
                    className="gap-1.5 shadow-[0_0_12px_oklch(0.75_0.18_145_/_0.25)]"
                  >
                    {claimStatus === "submitting" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Claim Scan <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </Button>
                </div>
                {claimError && <p className="text-xs text-rose-400">{claimError}</p>}
                <p className="text-xs text-muted-foreground">
                  No spam. One email per scan, unsubscribe anytime.
                </p>
              </form>
            )}

            {/* Next step CTA */}
            <div className="mt-8 rounded-xl border border-primary/40 bg-primary/[0.03] p-6 text-center shadow-[0_0_24px_oklch(0.75_0.18_145_/_0.15)]">
              <h2 className="text-lg font-semibold mb-2">Ready to plug the leak?</h2>
              <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
                SelfHeal&apos;s normalize feature returns only the fields your agent uses. Free for 500 calls/month.
              </p>
              <Link href="/llm-tax">
                <Button className="gap-1.5">
                  See how it works <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/50 py-10">
        <div className="container max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; 2026 SelfHeal. Built for AI engineers.</p>
          <div className="flex items-center gap-4">
            <Link href="/llm-tax" className="hover:text-foreground transition-colors">
              llm-tax
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
