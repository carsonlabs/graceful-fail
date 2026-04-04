import { useState } from "react";
import { Link } from "wouter";
import { Copy, Check, Zap, ChevronRight, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Code snippet generator ────────────────────────────────────────────────────

const SNIPPET_LANGS = ["curl", "python", "node", "typescript"] as const;
type Lang = (typeof SNIPPET_LANGS)[number];

function buildSnippet(lang: Lang, apiKey: string, destUrl: string, method: string, body: string): string {
  const hasBody = ["POST", "PUT", "PATCH"].includes(method);
  const bodyStr = hasBody ? body : "";

  switch (lang) {
    case "curl":
      return [
        `curl -X POST https://selfheal.dev/api/proxy \\`,
        `  -H "Authorization: Bearer ${apiKey}" \\`,
        `  -H "X-Destination-URL: ${destUrl}" \\`,
        `  -H "X-Destination-Method: ${method}" \\`,
        `  -H "Content-Type: application/json"` + (hasBody ? ` \\` : ""),
        hasBody ? `  -d '${bodyStr}'` : "",
      ].filter(Boolean).join("\n");

    case "python":
      return `import requests

response = requests.post(
    "https://selfheal.dev/api/proxy",
    headers={
        "Authorization": "Bearer ${apiKey}",
        "X-Destination-URL": "${destUrl}",
        "X-Destination-Method": "${method}",
        "Content-Type": "application/json",
    },${hasBody ? `\n    json=${bodyStr},` : ""}
)

data = response.json()

if data.get("graceful_fail_intercepted"):
    analysis = data["error_analysis"]
    print(f"Error: {analysis['human_readable_explanation']}")
    print(f"Fix:   {analysis['actionable_fix_for_agent']}")
    print(f"Retriable: {analysis['is_retriable']}")
else:
    print("Success:", data)`;

    case "node":
      return `const response = await fetch("https://selfheal.dev/api/proxy", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "X-Destination-URL": "${destUrl}",
    "X-Destination-Method": "${method}",
    "Content-Type": "application/json",
  },${hasBody ? `\n  body: JSON.stringify(${bodyStr}),` : ""}
});

const data = await response.json();

if (data.graceful_fail_intercepted) {
  const { error_analysis } = data;
  console.log("Error:", error_analysis.human_readable_explanation);
  console.log("Fix:  ", error_analysis.actionable_fix_for_agent);
  console.log("Retriable:", error_analysis.is_retriable);
} else {
  console.log("Success:", data);
}`;

    case "typescript":
      return `interface GracefulFailResponse {
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
}

const response = await fetch("https://selfheal.dev/api/proxy", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "X-Destination-URL": "${destUrl}",
    "X-Destination-Method": "${method}",
    "Content-Type": "application/json",
  },${hasBody ? `\n  body: JSON.stringify(${bodyStr}),` : ""}
});

const data: GracefulFailResponse = await response.json();

if (data.graceful_fail_intercepted && data.error_analysis) {
  const { error_analysis } = data;
  // Feed this directly to your AI agent
  console.log(error_analysis.actionable_fix_for_agent);
}`;
  }
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────

function CodeBlock({ code, className = "" }: { code: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <pre className="text-xs font-mono bg-[#0d1117] border border-border rounded-lg p-4 overflow-x-auto text-[#e6edf3] leading-relaxed">
        {code}
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl font-bold text-foreground mt-12 mb-4 scroll-mt-24 flex items-center gap-2">
      <a href={`#${id}`} className="text-muted-foreground/40 hover:text-primary transition-colors">#</a>
      {children}
    </h2>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Docs() {
  const [lang, setLang] = useState<Lang>("curl");
  const [apiKey, setApiKey] = useState("gf_your_api_key_here");
  const [destUrl, setDestUrl] = useState("https://api.example.com/users");
  const [method, setMethod] = useState("POST");
  const [body, setBody] = useState('{"name": "Alice"}');

  const snippet = buildSnippet(lang, apiKey, destUrl, method, body);

  const errorResponseExample = JSON.stringify({
    graceful_fail_intercepted: true,
    original_status_code: 422,
    destination_url: "https://api.example.com/users",
    error_analysis: {
      is_retriable: false,
      human_readable_explanation: "The request body is missing the required 'email' field. The API requires both 'name' and 'email' to create a user.",
      actionable_fix_for_agent: "Add the 'email' field to the request body before retrying. The value must be a valid email address string.",
      suggested_payload_diff: {
        remove: [],
        add: { email: "string (valid email address)" },
        modify: {},
      },
      error_category: "validation_error",
    },
    raw_destination_response: { error: "Unprocessable Entity", details: [{ field: "email", message: "is required" }] },
    meta: { credits_used: 1, duration_ms: 312, tier: "hobby" },
  }, null, 2);

  const passthroughExample = JSON.stringify({
    id: 42,
    name: "Alice",
    email: "alice@example.com",
    created_at: "2026-03-26T14:00:00Z",
  }, null, 2);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">SelfHeal</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">API Reference</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/status" className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden md:block">
              System Status
            </Link>
            <Link href="/changelog" className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden md:block">
              Changelog
            </Link>
            <Link href="/dashboard/playground">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <ExternalLink className="w-3 h-3" />
                Try in Playground
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="sm" className="text-xs">Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12 grid lg:grid-cols-[220px_1fr] gap-12">
        {/* Sidebar TOC */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1">
            {[
              { id: "overview", label: "Overview" },
              { id: "authentication", label: "Authentication" },
              { id: "endpoint", label: "Endpoint" },
              { id: "headers", label: "Request Headers" },
              { id: "responses", label: "Response Schema" },
              { id: "error-categories", label: "Error Categories" },
              { id: "code-examples", label: "Code Examples" },
              { id: "sdks", label: "SDKs" },
              { id: "rate-limits", label: "Rate Limits" },
              { id: "openapi", label: "OpenAPI Spec" },
            ].map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded hover:bg-muted"
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="min-w-0">
          {/* Hero */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 mb-4">
              v1.0 · REST API
            </div>
            <h1 className="text-4xl font-bold text-foreground mb-3">API Reference</h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              SelfHeal is a single-endpoint proxy that sits between your AI agent and any third-party API.
              On success, it passes the response through with zero overhead. On failure, it returns a structured,
              LLM-generated analysis that tells your agent exactly what went wrong and how to fix it.
            </p>
          </div>

          {/* Overview */}
          <SectionHeading id="overview">Overview</SectionHeading>
          <p className="text-muted-foreground text-sm leading-relaxed mb-4">
            Instead of your agent receiving a raw <code className="font-mono bg-muted px-1 rounded text-xs">422 Unprocessable Entity</code> and
            halting, SelfHeal intercepts the error, strips sensitive headers, sends the context to an LLM,
            and returns a structured JSON envelope your agent can act on immediately — including whether to retry,
            what field to change, and a plain-English explanation.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            {[
              { label: "Pass-through latency", value: "< 5ms", desc: "On 2xx/3xx responses" },
              { label: "Error analysis", value: "~300ms", desc: "LLM call on 4xx/5xx" },
              { label: "Credit cost", value: "1 credit", desc: "Only on intercepted errors" },
            ].map(({ label, value, desc }) => (
              <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold text-primary mt-0.5">{value}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {/* Authentication */}
          <SectionHeading id="authentication">Authentication</SectionHeading>
          <p className="text-sm text-muted-foreground mb-3">
            All requests must include your API key as a Bearer token in the <code className="font-mono bg-muted px-1 rounded text-xs">Authorization</code> header.
            API keys are created in the <Link href="/dashboard/keys" className="text-primary underline">Dashboard → API Keys</Link> section.
            The full key is shown only once at creation time — store it securely.
          </p>
          <CodeBlock code={`Authorization: Bearer gf_your_api_key_here`} className="mb-4" />

          {/* Endpoint */}
          <SectionHeading id="endpoint">Endpoint</SectionHeading>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 mb-4 font-mono text-sm">
            <span className="text-xs font-bold bg-primary/10 text-primary border border-primary/20 rounded px-2 py-0.5">POST</span>
            <span className="text-foreground">/api/proxy</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            This is the only endpoint. The destination URL, HTTP method, and any destination-specific headers are
            passed as request headers rather than path parameters, so your agent can use a single, stable URL for all proxied calls.
          </p>

          {/* Headers */}
          <SectionHeading id="headers">Request Headers</SectionHeading>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Header</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { header: "Authorization", required: true, desc: "Bearer token. Format: Bearer gf_..." },
                  { header: "X-Destination-URL", required: true, desc: "Full URL of the target API endpoint" },
                  { header: "X-Destination-Method", required: false, desc: "HTTP method to use for the destination request. Defaults to POST" },
                  { header: "Content-Type", required: false, desc: "Pass application/json when sending a body. Forwarded to the destination" },
                  { header: "Any other header", required: false, desc: "All other headers are forwarded to the destination as-is, except Authorization (stripped for security)" },
                ].map(({ header, required, desc }) => (
                  <tr key={header} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-foreground whitespace-nowrap">{header}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${required ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {required ? "Required" : "Optional"}
                      </span>
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Responses */}
          <SectionHeading id="responses">Response Schema</SectionHeading>
          <p className="text-sm text-muted-foreground mb-3">
            SelfHeal returns two types of responses depending on the destination API's status code.
          </p>

          <h3 className="text-sm font-semibold text-foreground mb-2 mt-5">Pass-through (2xx / 3xx)</h3>
          <p className="text-xs text-muted-foreground mb-2">
            The destination response body is returned verbatim. No credits are consumed. The response status code mirrors the destination.
          </p>
          <CodeBlock code={passthroughExample} className="mb-5" />

          <h3 className="text-sm font-semibold text-foreground mb-2">Intercepted Error (4xx / 5xx)</h3>
          <p className="text-xs text-muted-foreground mb-2">
            The response status code mirrors the destination. The body is the SelfHeal envelope below. One credit is consumed.
          </p>
          <CodeBlock code={errorResponseExample} className="mb-4" />

          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Field</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { field: "graceful_fail_intercepted", type: "boolean", desc: "Always true for intercepted errors" },
                  { field: "original_status_code", type: "number", desc: "HTTP status code returned by the destination" },
                  { field: "error_analysis.is_retriable", type: "boolean", desc: "Whether retrying the same request may succeed (e.g. 429, 503)" },
                  { field: "error_analysis.human_readable_explanation", type: "string", desc: "Plain-English explanation of what went wrong" },
                  { field: "error_analysis.actionable_fix_for_agent", type: "string", desc: "Exact instruction for the agent on how to correct the request" },
                  { field: "error_analysis.suggested_payload_diff.remove", type: "string[]", desc: "Fields to remove from the request body" },
                  { field: "error_analysis.suggested_payload_diff.add", type: "object", desc: "Fields to add, with expected type as value" },
                  { field: "error_analysis.suggested_payload_diff.modify", type: "object", desc: "Fields to change, with suggested new value" },
                  { field: "error_analysis.error_category", type: "string", desc: "One of the error categories listed below" },
                  { field: "raw_destination_response", type: "unknown", desc: "The original response body from the destination API" },
                  { field: "meta.credits_used", type: "number", desc: "Number of credits consumed (1 for intercepted errors)" },
                  { field: "meta.duration_ms", type: "number", desc: "Total proxy round-trip time in milliseconds" },
                  { field: "meta.tier", type: "string", desc: "The API key tier used for this request" },
                ].map(({ field, type, desc }) => (
                  <tr key={field} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-foreground whitespace-nowrap">{field}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-primary">{type}</td>
                    <td className="py-2.5 text-xs text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Error categories */}
          <SectionHeading id="error-categories">Error Categories</SectionHeading>
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            {[
              { cat: "validation_error", desc: "Missing or malformed request fields (400, 422)" },
              { cat: "authentication_error", desc: "Invalid or missing credentials (401)" },
              { cat: "authorization_error", desc: "Valid credentials but insufficient permissions (403)" },
              { cat: "not_found", desc: "Resource does not exist at the given path (404)" },
              { cat: "rate_limit", desc: "Too many requests; safe to retry after a delay (429)" },
              { cat: "server_error", desc: "Destination server-side failure (500, 502, 503)" },
              { cat: "timeout", desc: "Destination did not respond in time" },
              { cat: "unknown", desc: "Error could not be classified into a known category" },
            ].map(({ cat, desc }) => (
              <div key={cat} className="rounded-lg border border-border bg-card px-3 py-2.5">
                <p className="font-mono text-xs text-primary mb-0.5">{cat}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {/* Code examples */}
          <SectionHeading id="code-examples">Code Examples</SectionHeading>
          <p className="text-sm text-muted-foreground mb-4">
            Customize the snippet below with your own values, then copy it directly into your agent or workflow.
          </p>

          {/* Customizer */}
          <div className="rounded-lg border border-border bg-card p-4 mb-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customize snippet</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">API Key</label>
                <input
                  className="w-full text-xs font-mono bg-muted border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="gf_your_api_key_here"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Destination URL</label>
                <input
                  className="w-full text-xs font-mono bg-muted border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  value={destUrl}
                  onChange={(e) => setDestUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Method</label>
                <select
                  className="w-full text-xs font-mono bg-muted border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              {["POST", "PUT", "PATCH"].includes(method) && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Request Body (JSON)</label>
                  <input
                    className="w-full text-xs font-mono bg-muted border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder='{"key": "value"}'
                  />
                </div>
              )}
            </div>
          </div>

          {/* Language tabs */}
          <div className="flex gap-1 mb-2">
            {SNIPPET_LANGS.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`text-xs px-3 py-1.5 rounded-md font-mono transition-colors ${
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <CodeBlock code={snippet} className="mb-8" />

          {/* SDKs */}
          <SectionHeading id="sdks">Official SDKs</SectionHeading>
          <p className="text-sm text-muted-foreground mb-4">
            Official SDKs wrap the proxy endpoint with typed clients, error handling, and framework integrations.
            Use these instead of raw HTTP for a better developer experience.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-sm font-semibold text-foreground mb-1">Python</p>
              <CodeBlock code={`pip install 'graceful-fail[langchain]'`} className="mb-2" />
              <p className="text-xs text-muted-foreground">Sync + async client, LangChain tool, CrewAI compatible, requests-style session wrapper.</p>
              <a href="https://pypi.org/project/graceful-fail/" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                View on PyPI
              </a>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-sm font-semibold text-foreground mb-1">Node.js / TypeScript</p>
              <CodeBlock code={`npm install graceful-fail`} className="mb-2" />
              <p className="text-xs text-muted-foreground">Full TypeScript types, LangChain.js tool, ESM + CJS, native fetch (zero deps).</p>
              <a href="https://www.npmjs.com/package/graceful-fail" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                View on npm
              </a>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3 mb-8">
            <p className="text-sm font-semibold text-foreground mb-2">Also available</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { name: "n8n Node", desc: "Community node for n8n workflows" },
                { name: "GitHub Action", desc: "CI/CD integration with one line" },
                { name: "Postman Collection", desc: "Import and test instantly" },
              ].map(({ name, desc }) => (
                <div key={name}>
                  <p className="text-xs font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Rate limits */}
          <SectionHeading id="rate-limits">Rate Limits</SectionHeading>
          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tier</th>
                  <th className="text-left py-2 pr-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Monthly Requests</th>
                  <th className="text-left py-2 pr-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">LLM Credits</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { tier: "Hobby", requests: "500", credits: "500", price: "Free" },
                  { tier: "Pro", requests: "10,000", credits: "10,000", price: "$149 / month" },
                  { tier: "Agency", requests: "50,000", credits: "50,000", price: "$349 / month" },
                ].map(({ tier, requests, credits, price }) => (
                  <tr key={tier} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 pr-6 text-sm font-medium text-foreground">{tier}</td>
                    <td className="py-2.5 pr-6 text-sm text-muted-foreground font-mono">{requests}</td>
                    <td className="py-2.5 pr-6 text-sm text-muted-foreground font-mono">{credits}</td>
                    <td className="py-2.5 text-sm text-primary font-medium">{price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Credits are only consumed when a request is intercepted (4xx/5xx). Successful pass-through requests (2xx/3xx) do not consume credits.
            When the monthly limit is reached, the proxy returns <code className="font-mono bg-muted px-1 rounded">HTTP 429</code> with an <code className="font-mono bg-muted px-1 rounded">upgrade_url</code> field.
          </p>

          {/* OpenAPI Spec */}
          <SectionHeading id="openapi">OpenAPI Spec</SectionHeading>
          <p className="text-sm text-muted-foreground mb-4">
            A machine-readable OpenAPI 3.1 specification is available for import into Postman, Insomnia, or any OpenAPI-compatible tool.
            The spec is always up-to-date as it is generated dynamically from the live server.
          </p>
          <div className="flex flex-wrap gap-3 mb-5">
            <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="gap-2 text-sm">
                <Download className="w-4 h-4" />
                Download openapi.json
              </Button>
            </a>
          </div>
          <div className="space-y-4">
            {[
              {
                tool: "Postman",
                steps: [
                  "Open Postman and click Import in the top-left",
                  'Select "Link" and paste: ' + window.location.origin + "/api/openapi.json",
                  "Click Continue then Import — all endpoints and schemas are ready",
                ],
              },
              {
                tool: "Insomnia",
                steps: [
                  "Open Insomnia and click Create → Import From URL",
                  'Paste: ' + window.location.origin + "/api/openapi.json",
                  "Click Fetch and Import — the proxy endpoint appears in your collection",
                ],
              },
            ].map(({ tool, steps }) => (
              <div key={tool} className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-sm font-semibold text-foreground mb-2">{tool}</p>
                <ol className="space-y-1">
                  {steps.map((step, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-primary font-mono shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
