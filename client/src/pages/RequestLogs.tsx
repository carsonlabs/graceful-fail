import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, List, Download, Loader2, ChevronDown, ChevronUp, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 20;

function statusColor(code: number) {
  if (code >= 500) return "bg-red-500/15 text-red-400";
  if (code >= 400) return "bg-amber-500/15 text-amber-400";
  if (code >= 300) return "bg-blue-500/15 text-blue-400";
  return "bg-emerald-500/15 text-emerald-400";
}

function methodColor(method: string) {
  switch (method) {
    case "GET": return "text-emerald-400";
    case "POST": return "text-blue-400";
    case "PUT": return "text-amber-400";
    case "PATCH": return "text-purple-400";
    case "DELETE": return "text-red-400";
    default: return "text-muted-foreground";
  }
}

export default function RequestLogs() {
  const [page, setPage] = useState(0);
  const [interceptedOnly, setInterceptedOnly] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  async function handleExportCsv() {
    setExporting(true);
    try {
      const result = await utils.dashboard.exportLogs.fetch({ interceptedOnly });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graceful-fail-logs${interceptedOnly ? "-errors" : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} request${result.count !== 1 ? "s" : ""} to CSV`);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const { data, isLoading } = trpc.dashboard.requestLogs.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    interceptedOnly,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <AppLayout>
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Request Logs</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Full history of proxied requests and intercepted errors
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="intercepted-toggle" className="text-sm text-muted-foreground cursor-pointer">
              Errors only
            </Label>
            <Switch
              id="intercepted-toggle"
              checked={interceptedOnly}
              onCheckedChange={(v) => { setInterceptedOnly(v); setPage(0); }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={exporting || !data?.total}
              className="gap-1.5 text-xs"
            >
              {exporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Export CSV
            </Button>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="px-5 pt-5 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              {data?.total ?? 0} total requests
            </CardTitle>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {isLoading ? (
              <div className="space-y-0">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 bg-muted/30 border-b border-border animate-pulse" />
                ))}
              </div>
            ) : !data?.logs?.length ? (
              <div className="text-center py-16 text-muted-foreground">
                <List className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">
                  {interceptedOnly ? "No intercepted errors found." : "No requests logged yet."}
                </p>
              </div>
            ) : (
              <>
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-border bg-muted/20 text-xs text-muted-foreground font-medium">
                  <div className="col-span-1">Status</div>
                  <div className="col-span-1">Method</div>
                  <div className="col-span-4">Destination</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-1">Duration</div>
                  <div className="col-span-2">Time</div>
                  <div className="col-span-1"></div>
                </div>

                {data.logs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <div key={log.id} className="border-b border-border last:border-0">
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="grid grid-cols-12 gap-2 px-5 py-3 hover:bg-muted/10 transition-colors text-sm cursor-pointer select-none"
                      >
                        <div className="col-span-1 flex items-center">
                          <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${statusColor(log.statusCode)}`}>
                            {log.statusCode}
                          </span>
                        </div>
                        <div className="col-span-1 flex items-center">
                          <span className={`text-xs font-mono font-semibold ${methodColor(log.method)}`}>
                            {log.method}
                          </span>
                        </div>
                        <div className="col-span-4 flex items-center min-w-0">
                          <span className="text-xs text-muted-foreground font-mono truncate" title={log.destinationUrl}>
                            {(() => { try { return new URL(log.destinationUrl).host + new URL(log.destinationUrl).pathname; } catch { return log.destinationUrl; } })()}
                          </span>
                        </div>
                        <div className="col-span-2 flex items-center gap-1.5">
                          {log.wasIntercepted ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="text-xs text-amber-400">Intercepted</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="text-xs text-emerald-400">Pass-through</span>
                            </>
                          )}
                        </div>
                        <div className="col-span-1 flex items-center">
                          <span className="text-xs text-muted-foreground">{log.durationMs}ms</span>
                        </div>
                        <div className="col-span-2 flex items-center">
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="col-span-1 flex items-center justify-end">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div className="px-5 pb-4 bg-muted/5 border-t border-border/50">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            {/* Left column — Request Info */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Request Details</h4>
                              <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Destination URL</span>
                                  <span className="text-foreground font-mono text-right max-w-[280px] truncate" title={log.destinationUrl}>
                                    {log.destinationUrl}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Method</span>
                                  <span className={`font-mono font-semibold ${methodColor(log.method)}`}>{log.method}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Status Code</span>
                                  <span className={`font-mono font-semibold px-1.5 py-0.5 rounded ${statusColor(log.statusCode)}`}>
                                    {log.statusCode}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Duration</span>
                                  <span className="text-foreground font-mono">{log.durationMs}ms</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Credits Used</span>
                                  <span className="text-foreground">{log.creditsUsed}</span>
                                </div>
                                {log.provider && (
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Detected Provider</span>
                                    <span className="text-foreground capitalize">{log.provider}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Timestamp</span>
                                  <span className="text-foreground font-mono">
                                    {new Date(log.createdAt).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Right column — LLM Analysis */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                {log.wasIntercepted ? "LLM Analysis" : "No Analysis"}
                              </h4>
                              {log.wasIntercepted ? (
                                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
                                  {log.errorCategory && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Category:</span>
                                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                                        {log.errorCategory}
                                      </span>
                                    </div>
                                  )}
                                  {log.isRetriable !== null && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Retriable:</span>
                                      {log.isRetriable ? (
                                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                                          <RefreshCw className="w-3 h-3" /> Yes — safe to retry
                                        </span>
                                      ) : (
                                        <span className="flex items-center gap-1 text-xs text-red-400">
                                          <XCircle className="w-3 h-3" /> No — fix required
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {log.errorSummary && (
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">Error Summary</p>
                                      <p className="text-sm text-foreground leading-relaxed">{log.errorSummary}</p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="rounded-lg border border-border bg-background p-3">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    Request passed through successfully — no LLM analysis was triggered.
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>

        {/* Error summary panel */}
        {data?.logs?.some((l) => l.wasIntercepted && l.errorSummary) && (
          <div className="mt-6 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Recent Error Summaries</h2>
            {data.logs
              .filter((l) => l.wasIntercepted && l.errorSummary)
              .slice(0, 3)
              .map((log) => (
                <Card key={log.id} className="bg-card border-amber-500/20">
                  <CardContent className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-muted-foreground mb-1">
                          {log.method} {(() => { try { return new URL(log.destinationUrl).host; } catch { return log.destinationUrl; } })()}
                          {" · "}
                          <span className="text-amber-400">{log.statusCode}</span>
                          {log.isRetriable !== null && (
                            <span className={`ml-2 ${log.isRetriable ? "text-emerald-400" : "text-red-400"}`}>
                              {log.isRetriable ? "✓ Retriable" : "✗ Not retriable"}
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-foreground">{log.errorSummary}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
