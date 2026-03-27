import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { BarChart2, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function UsageAnalytics() {
  const { data: usageHistory, isLoading } = trpc.dashboard.usageHistory.useQuery();
  const { data: stats } = trpc.dashboard.stats.useQuery();

  // Prepare chart data — most recent 6 months, oldest first
  const chartData = (usageHistory ?? [])
    .slice(0, 6)
    .reverse()
    .map((row) => ({
      month: row.month,
      "Pass-through": row.totalRequests - row.interceptedRequests,
      "Intercepted": row.interceptedRequests,
      "Credits Used": row.creditsUsed,
    }));

  const TIER_LIMITS = { hobby: 500, pro: 10000, agency: 50000 };

  return (
    <AppLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6 md:mb-8">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Usage & Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monthly breakdown of your proxy activity and credit consumption
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Total This Month",
              value: stats?.totalRequests ?? 0,
              icon: BarChart2,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
            },
            {
              label: "Intercepted",
              value: stats?.interceptedRequests ?? 0,
              icon: AlertTriangle,
              color: "text-amber-400",
              bg: "bg-amber-500/10",
            },
            {
              label: "Credits Used",
              value: stats?.creditsUsed ?? 0,
              icon: Zap,
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              label: "Success Rate",
              value: `${stats?.successRate ?? 100}%`,
              icon: CheckCircle2,
              color: "text-emerald-400",
              bg: "bg-emerald-500/10",
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5">
                <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="text-2xl font-bold text-foreground">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Monthly chart */}
        <Card className="bg-card border-border mb-6">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">Monthly Request Volume</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {isLoading ? (
              <div className="h-64 bg-muted/30 rounded-lg animate-pulse" />
            ) : chartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                <div className="text-center">
                  <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  No usage data yet. Start proxying requests to see analytics.
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 240)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "oklch(0.16 0.01 240)",
                      border: "1px solid oklch(0.25 0.01 240)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "oklch(0.95 0.01 240)", fontWeight: 600 }}
                    itemStyle={{ color: "oklch(0.75 0.01 240)" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                    formatter={(value) => (
                      <span style={{ color: "oklch(0.65 0.01 240)" }}>{value}</span>
                    )}
                  />
                  <Bar dataKey="Pass-through" fill="oklch(0.75 0.18 145)" radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="Intercepted" fill="oklch(0.65 0.18 60)" radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly breakdown table */}
        <Card className="bg-card border-border">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">Monthly Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {!usageHistory?.length ? (
              <div className="text-center py-8 text-muted-foreground text-sm px-5">
                No usage history yet.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-5 gap-2 px-5 py-2 border-b border-border bg-muted/20 text-xs text-muted-foreground font-medium">
                  <div>Month</div>
                  <div>Total Requests</div>
                  <div>Intercepted</div>
                  <div>Credits Used</div>
                  <div>Success Rate</div>
                </div>
                {usageHistory.map((row) => {
                  const successRate =
                    row.totalRequests > 0
                      ? Math.round(((row.totalRequests - row.interceptedRequests) / row.totalRequests) * 100)
                      : 100;
                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-5 gap-2 px-5 py-3 border-b border-border last:border-0 text-sm hover:bg-muted/10 transition-colors"
                    >
                      <div className="text-foreground font-mono text-xs">{row.month}</div>
                      <div className="text-foreground">{row.totalRequests.toLocaleString()}</div>
                      <div className="text-amber-400">{row.interceptedRequests.toLocaleString()}</div>
                      <div className="text-primary">{row.creditsUsed.toLocaleString()}</div>
                      <div className={successRate >= 90 ? "text-emerald-400" : successRate >= 70 ? "text-amber-400" : "text-red-400"}>
                        {successRate}%
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
