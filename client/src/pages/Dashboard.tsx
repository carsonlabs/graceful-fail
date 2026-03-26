import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, Zap, AlertTriangle, CheckCircle2, Key, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: keysData } = trpc.apiKeys.list.useQuery();
  const { data: logsData } = trpc.dashboard.requestLogs.useQuery({ limit: 5, offset: 0 });

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
      title: "Credits Used",
      value: stats?.creditsUsed ?? 0,
      icon: Zap,
      description: "Charged on failed requests",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Success Rate",
      value: `${stats?.successRate ?? 100}%`,
      icon: CheckCircle2,
      description: "Pass-through requests",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
  ];

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">Your proxy activity this month</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

        <div className="grid lg:grid-cols-2 gap-6">
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

        {/* Quick start guide */}
        <Card className="bg-card border-border mt-6">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">Quick Start</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="rounded-lg bg-background border border-border p-4">
              <p className="text-xs text-muted-foreground mb-3 font-mono">
                # Route your agent's API calls through Graceful Fail
              </p>
              <pre className="text-xs font-mono text-foreground/90 overflow-x-auto whitespace-pre">{`POST /api/proxy
Authorization: Bearer gf_your_key_here
X-Destination-URL: https://api.yourservice.com/endpoint
X-Destination-Method: POST
Content-Type: application/json

{ "your": "payload" }`}</pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
