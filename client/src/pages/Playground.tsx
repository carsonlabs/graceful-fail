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
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

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

export default function Playground() {
  const [destinationUrl, setDestinationUrl] = useState("https://httpbin.org/status/422");
  const [method, setMethod] = useState<string>("POST");
  const [body, setBody] = useState('{\n  "name": "John Doe"\n}');
  const [extraHeaders, setExtraHeaders] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-primary" />
            API Playground
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Test any API through the Graceful Fail proxy and see the LLM error analysis in real time
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
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

                <Button
                  className="w-full gap-2"
                  onClick={handleRun}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                  ) : (
                    <><Play className="w-4 h-4" /> Run Request</>
                  )}
                </Button>
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

                {!isLoading && !result && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <FlaskConical className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Run a request to see the response</p>
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
        </div>
      </div>
    </AppLayout>
  );
}
