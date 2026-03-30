import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, Zap, AlertTriangle, CheckCircle2, Key, ArrowRight, X, FlaskConical, Webhook, CreditCard, Copy, Check, RotateCcw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: keysData } = trpc.apiKeys.list.useQuery();
  const { data: logsData } = trpc.dashboard.requestLogs.useQuery({ limit: 5, offset: 0 });
  const { data: onboarding, refetch: refetchOnboarding } = trpc.dashboard.onboarding.useQuery();
  const dismissMutation = trpc.dashboard.dismissOnboarding.useMutation({
    onSuccess: () => refetchOnboarding(),
  });

  const onboardingSteps = [
    {
      id: "apiKey",
      label: "Create an API key",
      done: onboarding?.hasApiKey ?? false,
      href: "/dashboard/keys",
      icon: Key,
      cta: "Go to API Keys",
    },
    {
      id: "request",
      label: "Make a test request in the Playground",
      done: onboarding?.hasMadeRequest ?? false,
      href: "/dashboard/playground",
      icon: FlaskConical,
      cta: "Open Playground",
    },
    {
      id: "webhook",
      label: "Set up a webhook notification",
      done: onboarding?.hasWebhook ?? false,
      href: "/dashboard/webhooks",
      icon: Webhook,
      cta: "Configure Webhooks",
    },
    {
      id: "upgrade",
      label: "Upgrade to Pro for 10k requests/month",
      done: false,
      href: "/dashboard/billing",
      icon: CreditCard,
      cta: "View Billing",
    },
  ];
  const completedSteps = onboardingSteps.filter((s) => s.done).length;
  const allDone = completedSteps === onboardingSteps.length;
  const showChecklist = onboarding && !onboarding.isDismissed && !allDone;

  const autoRetries = stats?.autoRetries ?? 0;
  const retrySuccesses = stats?.retrySuccesses ?? 0;
  const retryRate = autoRetries > 0 ? Math.round((retrySuccesses / autoRetries) * 100) : 0;

  const statCards = [
    {
      title: "Total Requests",
      value: stats?.totalRequests ?? 0,
      icon: BarChart2,
      description: "This month",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      title: "Intercepted Errors",
      value: stats?.interceptedRequests ?? 0,
      icon: AlertTriangle,
      description: "LLM analysis triggered",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      title: "Auto-Retries",
      value: autoRetries > 0 ? `${autoRetries} (${retryRate}% fixed)` : "0",
      icon: RotateCcw,
      description: "Errors auto-fixed and retried",
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    {
      title: "Sentry Events",
      value: stats?.sentryEvents ?? 0,
      icon: Shield,
      description: "Analyzed from Sentry",
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
    {
      title: "Credits Used",
      value: stats?.creditsUsed ?? 0,
      icon: Zap,
      description: "Charged on failed requests",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Pass-through Rate",
      value: `${stats?.successRate ?? 100}%`,
      icon: CheckCircle2,
      description: "Requests forwarded without errors",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
  ];

  return (
    <AppLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6 md:mb-8">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">Your proxy activity this month</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
          {statCards.map(({ title, value, icon: Icon, description, color, bg }) => (
            <Card key={title} className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5">
                <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {isLoading ? (
                  <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                ) : (
                  <div className="text-2xl font-bold text-foreground">{value}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
          {/* Recent Logs */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between px-5 pt-5 pb-3">
              <CardTitle className="text-sm font-semibold">Recent Requests</CardTitle>
              <Link href="/dashboard/logs">
                <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground">
                  View all <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {!logsData?.logs?.length ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No requests yet. Start proxying API calls to see logs here.
                </div>
              ) : (
                <div className="space-y-2">
                  {logsData.logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                            log.wasIntercepted
                              ? "bg-red-500/15 text-red-400"
                              : "bg-emerald-500/15 text-emerald-400"
                          }`}
                        >
                          {log.statusCode}
                        </span>
                        <span className="text-xs text-muted-foreground truncate font-mono">
                          {log.method} {new URL(log.destinationUrl).pathname}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {log.durationMs}ms
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* API Keys quick view */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between px-5 pt-5 pb-3">
              <CardTitle className="text-sm font-semibold">API Keys</CardTitle>
              <Link href="/dashboard/keys">
                <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground">
                  Manage <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {!keysData?.length ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No API keys yet.{" "}
                  <Link href="/dashboard/keys" className="text-primary hover:underline">
                    Create your first key
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {keysData.slice(0, 5).map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Key className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{key.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}••••••••</p>
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          key.tier === "agency"
                            ? "bg-purple-500/15 text-purple-400"
                            : key.tier === "pro"
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-zinc-500/15 text-zinc-400"
                        }`}
                      >
                        {key.tier}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Onboarding Checklist */}
        {showChecklist && (
          <Card className="bg-card border-primary/30 border mt-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
            <CardHeader className="px-5 pt-5 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Getting Started
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {completedSteps} of {onboardingSteps.length} steps complete
                </p>
              </div>
              <button
                onClick={() => dismissMutation.mutate()}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-1.5 mb-5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }}
                />
              </div>
              <div className="space-y-3">
                {onboardingSteps.map((step) => (
                  <div key={step.id} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          step.done
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {step.done ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <step.icon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          step.done ? "line-through text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {!step.done && (
                      <Link href={step.href}>
                        <Button variant="outline" size="sm" className="text-xs shrink-0 gap-1">
                          {step.cta} <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick start guide */}
        <QuickStartCard apiKeyPrefix={keysData?.[0]?.keyPrefix} />
      </div>
    </AppLayout>
  );
}

function QuickStartCard({ apiKeyPrefix }: { apiKeyPrefix?: string }) {
  const [copied, setCopied] = useState(false);
  const keyPlaceholder = apiKeyPrefix ? `${apiKeyPrefix}••••••••` : "gf_your_key_here";
  const codeSnippet = `POST /api/proxy
Authorization: Bearer ${keyPlaceholder}
X-Destination-URL: https://api.yourservice.com/endpoint
X-Destination-Method: POST
Content-Type: application/json

{ "your": "payload" }`;

  function handleCopy() {
    navigator.clipboard.writeText(codeSnippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
        <Card className="bg-card border-border mt-6">
          <CardHeader className="px-5 pt-5 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Quick Start</CardTitle>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="rounded-lg bg-background border border-border p-4">
              <p className="text-xs text-muted-foreground mb-3 font-mono">
                # Route your agent's API calls through SelfHeal
              </p>
              <pre className="text-xs font-mono text-foreground/90 overflow-x-auto whitespace-pre">{codeSnippet}</pre>
            </div>
          </CardContent>
        </Card>
  );
}
