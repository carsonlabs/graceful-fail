import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Play,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  FlaskConical,
  Share2,
  Webhook,
  Send,
} from "lucide-react";
import { useState as useTabState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEffect } from "react";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const DEMO_RESULT: PlaygroundResult = {
  graceful_fail_intercepted: true,
  original_status_code: 422,
  destination_url: "https://httpbin.org/status/422",
  error_analysis: {
    is_retriable: false,
    human_readable_explanation:
      "The API returned a 422 Unprocessable Entity error. The request body is missing the required 'email' field that the endpoint expects for user creation.",
    actionable_fix_for_agent:
      "Add the required 'email' field to the request body. Example: { \"name\": \"John Doe\", \"email\": \"john@example.com\" }",
    suggested_payload_diff: {
      remove: [],
      add: { email: "string (required)" },
      modify: {},
    },
    error_category: "validation_error",
  },
  meta: { credits_used: 1, duration_ms: 847, tier: "hobby" },
};

interface PlaygroundResult {
  graceful_fail_intercepted: boolean;
  original_status_code: number;
  destination_url: string;
  error_analysis?: {
    is_retriable: boolean;
    human_readable_explanation: string;
    actionable_fix_for_agent: string;
    suggested_payload_diff: {
      remove: string[];
      add: Record<string, string>;
      modify: Record<string, string>;
    };
    error_category: string;
  };
  raw_destination_response?: unknown;
  meta?: { credits_used: number; duration_ms: number; tier: string };
  // pass-through fields
  [key: string]: unknown;
}

function DiffViewer({ diff }: { diff: { remove: string[]; add: Record<string, string>; modify: Record<string, string> } | undefined }) {
  if (!diff) return null;
  const hasChanges =
    diff.remove.length > 0 ||
    Object.keys(diff.add).length > 0 ||
    Object.keys(diff.modify).length > 0;

  if (!hasChanges) return <p className="text-xs text-muted-foreground">No payload changes suggested.</p>;

  return (
    <div className="space-y-2 font-mono text-xs">
      {diff.remove.map((field) => (
        <div key={field} className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5">
          <span className="text-red-400 font-bold">−</span>
          <span className="text-red-300">Remove field: <strong>{field}</strong></span>
        </div>
      ))}
      {Object.entries(diff.add).map(([field, type]) => (
        <div key={field} className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded px-3 py-1.5">
          <span className="text-emerald-400 font-bold">+</span>
          <span className="text-emerald-300">Add field: <strong>{field}</strong> <span className="text-muted-foreground">({String(type)})</span></span>
        </div>
      ))}
      {Object.entries(diff.modify).map(([field, value]) => (
        <div key={field} className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-1.5">
          <span className="text-amber-400 font-bold">~</span>
          <span className="text-amber-300">Modify field: <strong>{field}</strong> → <span className="text-muted-foreground">{String(value)}</span></span>
        </div>
      ))}
    </div>
  );
}

function readQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    destinationUrl: params.get("url") ?? "https://httpbin.org/status/422",
    method: params.get("method") ?? "POST",
    body: params.get("body") ? decodeURIComponent(params.get("body")!) : '{\n  "name": "John Doe"\n}',
    extraHeaders: params.get("headers") ? decodeURIComponent(params.get("headers")!) : "",
  };
}

export default function Playground() {
  const initial = readQueryParams();
  const [activeTab, setActiveTab] = useTabState<"proxy" | "webhook">("proxy");
  const [destinationUrl, setDestinationUrl] = useState(initial.destinationUrl);
  const [method, setMethod] = useState<string>(initial.method);
  const [body, setBody] = useState(initial.body);
  const [extraHeaders, setExtraHeaders] = useState(initial.extraHeaders);
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showingDemo, setShowingDemo] = useState(true);
  // Webhook dry-run state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookPayload, setWebhookPayload] = useState(() =>
    JSON.stringify({
      event: "non_retriable_error",
      timestamp: new Date().toISOString(),
      data: {
        request_id: "dry_run_sample",
        destination_url: "https://api.example.com/endpoint",
        method: "POST",
        status_code: 422,
        error_category: "validation_error",
        is_retriable: false,
        actionable_fix_for_agent: "This is a dry-run test payload from SelfHeal Playground.",
      },
    }, null, 2)
  );
  const [webhookResult, setWebhookResult] = useState<{
    success: boolean; statusCode: number; statusText: string;
    responseMs: number; responseBody: string; payloadSent: string;
  } | null>(null);
  const webhookDryRun = trpc.playground.webhookDryRun.useMutation({
    onSuccess: (data) => setWebhookResult(data),
    onError: (err) => toast.error("Dry-run failed: " + err.message),
  });
  const [rawExpanded, setRawExpanded] = useState(false);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const { data: keys } = trpc.apiKeys.list.useQuery();

  const handleRun = async () => {
    if (!destinationUrl) return toast.error("Destination URL is required");
    if (!apiKey.trim()) {
      toast.error("Paste your full API key (gf_...) — it was shown once when you created it");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setShowingDemo(false);
    const start = Date.now();

    try {
      // Parse extra headers
      const parsedHeaders: Record<string, string> = {};
      if (extraHeaders.trim()) {
        for (const line of extraHeaders.split("\n")) {
          const idx = line.indexOf(":");
          if (idx > 0) {
            parsedHeaders[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          }
        }
      }

      // Parse body
      let parsedBody: unknown = undefined;
      if (["POST", "PUT", "PATCH"].includes(method) && body.trim()) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = body;
        }
      }

      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
          "X-Destination-URL": destinationUrl,
          "X-Destination-Method": method,
          ...parsedHeaders,
        },
        body: parsedBody !== undefined ? JSON.stringify(parsedBody) : undefined,
      });

      setDurationMs(Date.now() - start);
      const data = await response.json();
      setResult(data as PlaygroundResult);
    } catch (err) {
      toast.error("Failed to send request: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const copyPayload = () => {
    if (!result?.error_analysis?.suggested_payload_diff) return;
    const diff = result.error_analysis.suggested_payload_diff;
    try {
      const current = JSON.parse(body);
      // Apply diff
      const corrected = { ...current };
      for (const field of diff.remove) delete corrected[field];
      for (const [field, type] of Object.entries(diff.add)) corrected[field] = `<${type}>`;
      for (const [field, value] of Object.entries(diff.modify)) corrected[field] = value;
      navigator.clipboard.writeText(JSON.stringify(corrected, null, 2));
      toast.success("Corrected payload copied to clipboard!");
    } catch {
      toast.error("Could not apply diff to current body");
    }
  };

  const isIntercepted = result?.graceful_fail_intercepted === true;
  const isPassthrough = result && !isIntercepted;

  // Sync URL query params whenever request state changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("url", destinationUrl);
    params.set("method", method);
    if (body.trim()) params.set("body", encodeURIComponent(body));
    if (extraHeaders.trim()) params.set("headers", encodeURIComponent(extraHeaders));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }, [destinationUrl, method, body, extraHeaders]);

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Share link copied to clipboard!");
  };

  const buildCurlCommand = () => {
    const hasBody = ["POST", "PUT", "PATCH"].includes(method);
    const lines: string[] = [
      `curl -X POST ${window.location.origin}/api/proxy \\`,
      `  -H "Authorization: Bearer ${apiKey.trim() || "gf_your_key_here"}" \\`,
      `  -H "X-Destination-URL: ${destinationUrl}" \\`,
      `  -H "X-Destination-Method: ${method}" \\`,
      `  -H "Content-Type: application/json"`,
    ];
    if (extraHeaders.trim()) {
      for (const line of extraHeaders.split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) {
          lines[lines.length - 1] += " \\";
          lines.push(`  -H "${line.trim()}"`);
        }
      }
    }
    if (hasBody && body.trim()) {
      lines[lines.length - 1] += " \\";
      lines.push(`  -d '${body.replace(/'/g, "'\\''")}' `);
    }
    return lines.join("\n");
  };

  const copyCurl = () => {
    navigator.clipboard.writeText(buildCurlCommand());
    toast.success("cURL command copied to clipboard!");
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-primary" />
              Playground
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              See SelfHeal catch and fix a broken API call in real-time
            </p>
          </div>
          {activeTab === "proxy" && (
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={copyShareLink}>
              <Share2 className="w-3.5 h-3.5" />
              Share
            </Button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 bg-muted/40 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab("proxy")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "proxy"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            API Proxy Tester
          </button>
          <button
            onClick={() => setActiveTab("webhook")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "webhook"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            Webhook Dry-Run
          </button>
        </div>

        {activeTab === "webhook" && (
          <div className="max-w-2xl space-y-5">
            <Card className="bg-card border-border">
              <CardHeader className="px-5 py-4 pb-3">
                <CardTitle className="text-sm font-semibold">Webhook Endpoint</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fire a sample <code className="font-mono bg-muted px-1 rounded">non_retriable_error</code> payload to any URL and inspect the response. Use this to verify your endpoint before going live.
                </p>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-4">
                <div>
                  <Label className="text-xs">Target Webhook URL</Label>
                  <Input
                    placeholder="https://your-server.com/webhook"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Custom Payload Override <span className="text-muted-foreground">(optional — leave blank to use default sample)</span></Label>
                  <Textarea
                    placeholder={'{ "event": "non_retriable_error", ... }'}
                    value={webhookPayload}
                    onChange={(e) => setWebhookPayload(e.target.value)}
                    className="mt-1 font-mono text-xs h-32 resize-none"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (!webhookUrl.trim()) return toast.error("Enter a webhook URL first");
                    setWebhookResult(null);
                    webhookDryRun.mutate({ url: webhookUrl.trim(), payload: webhookPayload.trim() || undefined });
                  }}
                  disabled={webhookDryRun.isPending}
                  className="w-full gap-2"
                >
                  {webhookDryRun.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {webhookDryRun.isPending ? "Sending..." : "Fire Dry-Run"}
                </Button>
              </CardContent>
            </Card>

            {webhookResult && (
              <Card className="bg-card border-border">
                <CardHeader className="px-5 py-4 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Response</CardTitle>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{webhookResult.responseMs}ms</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        webhookResult.statusCode >= 200 && webhookResult.statusCode < 300
                          ? "bg-emerald-500/15 text-emerald-400"
                          : webhookResult.statusCode === 0
                          ? "bg-red-500/15 text-red-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}>
                        {webhookResult.statusCode === 0 ? (
                          <><XCircle className="w-3 h-3" /> Connection Failed</>
                        ) : (
                          <><CheckCircle2 className="w-3 h-3" /> {webhookResult.statusCode} {webhookResult.statusText}</>
                        )}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Response Body</p>
                    <pre className="bg-background rounded-md p-3 text-xs font-mono text-foreground overflow-auto max-h-48 border border-border whitespace-pre-wrap break-all">
                      {webhookResult.responseBody || "(empty body)"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Payload Sent</p>
                    <pre className="bg-background rounded-md p-3 text-xs font-mono text-muted-foreground overflow-auto max-h-48 border border-border whitespace-pre-wrap break-all">
                      {(() => { try { return JSON.stringify(JSON.parse(webhookResult.payloadSent), null, 2); } catch { return webhookResult.payloadSent; } })()}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === "proxy" && <div className="grid lg:grid-cols-2 gap-6">
          {/* ── Left: Request builder ── */}
          <div className="space-y-5">
            <Card className="bg-card border-border">
              <CardHeader className="px-5 py-4 pb-0">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Request</CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4 space-y-4">
                {/* API Key input — full key required, only shown once at creation */}
                <div>
                  <Label htmlFor="api-key-input" className="text-xs">Full API Key</Label>
                  <Input
                    id="api-key-input"
                    placeholder="gf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="mt-1 font-mono text-xs"
                    type="password"
                  />
                  {keys && keys.length > 0 && !apiKey && (
                    <p className="text-xs text-muted-foreground mt-1">
                      You have {keys.length} key{keys.length !== 1 ? "s" : ""}. Paste the full key from when it was created — only the prefix is stored.
                    </p>
                  )}
                  {!keys?.length && (
                    <p className="text-xs text-amber-400 mt-1">
                      No API keys yet. <a href="/dashboard/keys" className="underline">Create one first</a>.
                    </p>
                  )}
                </div>

                {/* Method + URL */}
                <div>
                  <Label className="text-xs">Destination URL</Label>
                  <div className="flex gap-2 mt-1">
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger className="w-28 font-mono text-xs shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HTTP_METHODS.map((m) => (
                          <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="https://api.example.com/endpoint"
                      value={destinationUrl}
                      onChange={(e) => setDestinationUrl(e.target.value)}
                      className="font-mono text-xs flex-1"
                    />
                  </div>
                </div>

                {/* Request body */}
                {["POST", "PUT", "PATCH"].includes(method) && (
                  <div>
                    <Label className="text-xs">Request Body (JSON)</Label>
                    <Textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="mt-1 font-mono text-xs resize-none"
                      rows={6}
                      placeholder='{ "key": "value" }'
                    />
                  </div>
                )}

                {/* Extra headers */}
                <div>
                  <Label className="text-xs">Extra Headers (one per line: Key: Value)</Label>
                  <Textarea
                    value={extraHeaders}
                    onChange={(e) => setExtraHeaders(e.target.value)}
                    className="mt-1 font-mono text-xs resize-none"
                    rows={3}
                    placeholder={"Content-Type: application/json\nX-Custom-Header: value"}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleRun}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                    ) : (
                      <><Play className="w-4 h-4" /> Run Request</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={copyCurl}
                    title="Copy as cURL command"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    cURL
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick examples */}
            <Card className="bg-muted/20 border-border">
              <CardContent className="px-5 py-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Examples</p>
                <div className="space-y-2">
                  {[
                    { label: "422 Validation Error", url: "https://httpbin.org/status/422", method: "POST" },
                    { label: "401 Unauthorized", url: "https://httpbin.org/status/401", method: "GET" },
                    { label: "429 Rate Limited", url: "https://httpbin.org/status/429", method: "POST" },
                    { label: "500 Server Error", url: "https://httpbin.org/status/500", method: "POST" },
                    { label: "200 Pass-through", url: "https://httpbin.org/json", method: "GET" },
                  ].map(({ label, url, method: m }) => (
                    <button
                      key={label}
                      className="w-full text-left text-xs px-3 py-2 rounded-md hover:bg-muted transition-colors flex items-center justify-between group"
                      onClick={() => { setDestinationUrl(url); setMethod(m); }}
                    >
                      <span className="text-foreground">{label}</span>
                      <span className="text-muted-foreground font-mono group-hover:text-primary transition-colors">{m}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Response ── */}
          <div>
            <Card className="bg-card border-border h-full">
              <CardHeader className="px-5 py-4 pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Response</CardTitle>
                  {durationMs !== null && result && (
                    <span className="text-xs text-muted-foreground font-mono">{durationMs}ms</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-5 py-4">
                {isLoading && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Forwarding request...</p>
                  </div>
                )}

                {!isLoading && !result && !showingDemo && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <FlaskConical className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Run a request to see the response</p>
                  </div>
                )}

                {!isLoading && !result && showingDemo && (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 flex items-center justify-between">
                      <p className="text-xs text-primary font-medium">Example — this is what SelfHeal returns when it catches an error</p>
                      <button
                        onClick={() => setShowingDemo(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Dismiss
                      </button>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
                      <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-red-400">
                          HTTP {DEMO_RESULT.original_status_code} — Non-Retriable Error
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Category: validation error · {DEMO_RESULT.meta?.credits_used} credit used · {DEMO_RESULT.meta?.duration_ms}ms
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">What went wrong</p>
                      <p className="text-sm text-foreground leading-relaxed">{DEMO_RESULT.error_analysis!.human_readable_explanation}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Actionable Fix for Agent</p>
                      <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
                        <p className="text-sm text-primary font-medium leading-relaxed">{DEMO_RESULT.error_analysis!.actionable_fix_for_agent}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Suggested Payload Changes</p>
                      <DiffViewer diff={DEMO_RESULT.error_analysis!.suggested_payload_diff} />
                    </div>
                  </div>
                )}

                {!isLoading && isPassthrough && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-400">Pass-through — No credits used</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          HTTP {(result as any).status ?? "2xx"} — Request forwarded with zero overhead
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Response Body</p>
                      <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-auto max-h-80 text-foreground">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {!isLoading && isIntercepted && result?.error_analysis && (
                  <div className="space-y-4">
                    {/* Status badge */}
                    <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 ${
                      result.error_analysis.is_retriable
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-red-500/10 border-red-500/30"
                    }`}>
                      {result.error_analysis.is_retriable ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                      )}
                      <div>
                        <p className={`text-sm font-semibold ${result.error_analysis.is_retriable ? "text-amber-400" : "text-red-400"}`}>
                          HTTP {result.original_status_code} — {result.error_analysis.is_retriable ? "Retriable" : "Non-Retriable"} Error
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                          Category: {result.error_analysis.error_category.replace(/_/g, " ")}
                          {result.meta && ` · ${result.meta.credits_used} credit used · ${result.meta.duration_ms}ms`}
                        </p>
                      </div>
                    </div>

                    {/* Explanation */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">What went wrong</p>
                      <p className="text-sm text-foreground leading-relaxed">{result.error_analysis.human_readable_explanation}</p>
                    </div>

                    {/* Actionable fix */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Actionable Fix for Agent</p>
                      <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
                        <p className="text-sm text-primary font-medium leading-relaxed">{result.error_analysis.actionable_fix_for_agent}</p>
                      </div>
                    </div>

                    {/* Payload diff */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested Payload Changes</p>
                        <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={copyPayload}>
                          <Copy className="w-3 h-3" />
                          Copy corrected payload
                        </Button>
                      </div>
                      <DiffViewer diff={result.error_analysis.suggested_payload_diff} />
                    </div>

                    {/* Raw response toggle */}
                    <div>
                      <button
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setRawExpanded(!rawExpanded)}
                      >
                        {rawExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Raw destination response
                      </button>
                      {rawExpanded && (
                        <pre className="mt-2 text-xs font-mono bg-muted rounded-lg p-3 overflow-auto max-h-48 text-foreground">
                          {JSON.stringify(result.raw_destination_response, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>}
      </div>
    </AppLayout>
  );
}
