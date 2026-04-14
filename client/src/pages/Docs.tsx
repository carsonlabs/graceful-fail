import { useState } from "react";
import { Link } from "wouter";
import { Copy, Check, Zap, ChevronRight, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Code snippet generator ────────────────────────────────────────────────────

const SNIPPET_LANGS = ["curl", "python", "node", "typescript"] as const;
type Lang = (typeof SNIPPET_LANGS)[number];

function buildSnippet(lang: Lang, destUrl: string, method: string, body: string): string {
  const hasBody = ["POST", "PUT", "PATCH"].includes(method);

  switch (lang) {
    case "curl":
      return [
        `curl -X POST https://selfheal.dev/api/x402/proxy \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '${JSON.stringify({
          url: destUrl,
          method,
          ...(hasBody ? { body } : {}),
        })}'`,
      ].join("\n");

    case "python":
      return `import httpx

response = httpx.post(
    "https://selfheal.dev/api/x402/proxy",
    json={
        "url": "${destUrl}",
        "method": "${method}",${hasBody ? `\n        "body": '${body}',` : ""}
    },
)

data = response.json()

if response.status_code == 402:
    # Payment required — x402 spec returned
    print("Payment required:", data["accepts"][0]["description"])
    print("Price:", data["accepts"][0]["maxAmountRequired"], "USDC (atomic)")
elif response.status_code == 200 and data.get("healed"):
    # Error was healed (paid flow)
    analysis = data["error_analysis"]
    print(f"Healed! Fix: {analysis['actionable_fix_for_agent']}")
else:
    # Success pass-through (free)
    print("Success:", data)`;

    case "node":
      return `const response = await fetch("https://selfheal.dev/api/x402/proxy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: "${destUrl}",
    method: "${method}",${hasBody ? `\n    body: '${body}',` : ""}
  }),
});

const data = await response.json();

if (response.status === 402) {
  // Payment required — x402 spec returned
  console.log("Price:", data.accepts[0].maxAmountRequired, "USDC");
} else if (data.healed) {
  // Error was healed
  console.log("Fix:", data.error_analysis.actionable_fix_for_agent);
} else {
  // Success pass-through (free)
  console.log("Success:", data);
}`;

    case "typescript":
      return `interface X402PaymentRequired {
  x402Version: 1;
  accepts: {
    scheme: "exact" | "upto";
    network: string;
    maxAmountRequired: string;
    payTo: string;
    description: string;
  }[];
  error: string;
}

interface HealedResponse {
  healed: true;
  settled: boolean;
  txHash?: string;
  error_analysis: {
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
}

const response = await fetch("https://selfheal.dev/api/x402/proxy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: "${destUrl}",
    method: "${method}",${hasBody ? `\n    body: '${body}',` : ""}
  }),
});

if (response.status === 402) {
  const spec: X402PaymentRequired = await response.json();
  // Agent pays via x402, then retries with X-PAYMENT header
} else {
  const data: HealedResponse = await response.json();
  if (data.healed) {
    console.log(data.error_analysis.actionable_fix_for_agent);
  }
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
  const [destUrl, setDestUrl] = useState("https://api.example.com/users");
  const [method, setMethod] = useState("POST");
  const [body, setBody] = useState('{"name": "Alice"}');

  const snippet = buildSnippet(lang, destUrl, method, body);

  const paymentRequiredExample = JSON.stringify({
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "https://api.example.com/users",
        description: "SelfHeal: error analysis + structured fix + retry payload [simple]",
        mimeType: "application/json",
        payTo: "0xYourWalletAddress",
        requiredDeadlineSeconds: 300,
        extra: { name: "USDC", token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
      },
    ],
    error: "Payment required for error analysis. Tier: simple ($0.001\u2013$0.002 USDC).",
  }, null, 2);

  const healedResponseExample = JSON.stringify({
    healed: true,
    settled: true,
    txHash: "0xabc123...",
    original_status_code: 422,
    error_analysis: {
      is_retriable: false,
      human_readable_explanation: "The request body is missing the required 'email' field.",
      actionable_fix_for_agent: "Add the 'email' field to the request body.",
      suggested_payload_diff: {
        remove: [],
        add: { email: "string (valid email address)" },
        modify: {},
      },
      error_category: "validation",
    },
    meta: { tier: "simple", cost_usdc: 0.001, latency_ms: 312 },
  }, null, 2);

  const passthroughExample = JSON.stringify({
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"id": 42, "name": "Alice", "email": "alice@example.com"}',
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
              { id: "x402-flow", label: "x402 Payment Flow" },
              { id: "endpoints", label: "Endpoints" },
              { id: "request-body", label: "Request Body" },
              { id: "responses", label: "Response Schema" },
              { id: "error-categories", label: "Error Categories" },
              { id: "code-examples", label: "Code Examples" },
              { id: "sdks", label: "SDKs" },
              { id: "pricing", label: "Pricing" },
              { id: "legacy-api", label: "Legacy API (v1)" },
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
              v2.0 · x402 Agent-Native API
            </div>
            <h1 className="text-4xl font-bold text-foreground mb-3">API Reference</h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              SelfHeal is an agent-native API proxy with outcome-based pricing. Agents send requests through the proxy
              and only pay (in USDC via x402 micropayments) when an error is successfully healed. Successes pass through free.
              No API keys. No subscriptions.
            </p>
          </div>

          {/* Overview */}
          <SectionHeading id="overview">Overview</SectionHeading>
          <p className="text-muted-foreground text-sm leading-relaxed mb-4">
            Your agent sends a request to <code className="font-mono bg-muted px-1 rounded text-xs">POST /api/x402/proxy</code> with the target URL in the JSON body.
            If the target returns a success (2xx/3xx), SelfHeal passes it through for free. If it fails (4xx/5xx),
            SelfHeal returns an x402 payment spec. The agent pays, retries with a payment proof, and gets LLM-powered
            fix instructions — but only gets charged if the heal succeeds.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            {[
              { label: "Pass-through latency", value: "< 200ms", desc: "On 2xx/3xx responses" },
              { label: "Heal analysis", value: "~300ms", desc: "LLM-powered on 4xx/5xx" },
              { label: "Cost per heal", value: "$0.001\u2013$0.005", desc: "USDC, only on success" },
            ].map(({ label, value, desc }) => (
              <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold text-primary mt-0.5">{value}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {/* x402 Payment Flow */}
          <SectionHeading id="x402-flow">x402 Payment Flow</SectionHeading>
          <p className="text-sm text-muted-foreground mb-4">
            SelfHeal uses the <a href="https://x402.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">x402 protocol</a> for
            machine-to-machine micropayments. No API keys, no accounts — just USDC on Base.
          </p>
          <div className="space-y-3 mb-6">
            {[
              { step: "1", title: "Agent sends request", desc: "POST to /api/x402/proxy with target URL in JSON body." },
              { step: "2", title: "Target succeeds (2xx)", desc: "Response passed through free. Zero cost." },
              { step: "3", title: "Target fails (4xx/5xx)", desc: "SelfHeal returns HTTP 402 with an x402 payment spec (price, wallet, network)." },
              { step: "4", title: "Agent pays", desc: "Agent sends USDC micropayment and retries with X-PAYMENT header containing the proof." },
              { step: "5", title: "Heal runs", desc: "SelfHeal verifies payment, runs LLM analysis, returns structured fix instructions." },
              { step: "6", title: "Settlement", desc: "Payment is settled only if the heal succeeds. Failed analyses are never charged." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</div>
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Endpoints */}
          <SectionHeading id="endpoints">Endpoints</SectionHeading>
          <div className="space-y-3 mb-6">
            {[
              { method: "POST", path: "/api/x402/proxy", desc: "Proxy a request with x402 payment on failure" },
              { method: "POST", path: "/api/x402/heal", desc: "Direct heal — submit an error for analysis" },
              { method: "GET", path: "/api/x402/pricing", desc: "Current pricing tiers" },
              { method: "GET", path: "/api/x402/usage", desc: "Usage stats (heals, payments, latency)" },
              { method: "GET", path: "/metrics", desc: "Prometheus metrics scrape endpoint" },
              { method: "GET", path: "/health", desc: "Health check" },
            ].map(({ method: m, path, desc }) => (
              <div key={path} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
                <span className={`text-xs font-bold border rounded px-2 py-0.5 ${m === "POST" ? "bg-primary/10 text-primary border-primary/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>{m}</span>
                <span className="font-mono text-sm text-foreground">{path}</span>
                <span className="text-xs text-muted-foreground ml-auto hidden sm:block">{desc}</span>
              </div>
            ))}
          </div>

          {/* Request Body */}
          <SectionHeading id="request-body">Request Body</SectionHeading>
          <p className="text-sm text-muted-foreground mb-3">
            Send a JSON body to <code className="font-mono bg-muted px-1 rounded text-xs">POST /api/x402/proxy</code> with the target request details.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Field</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { field: "url", type: "string", required: true, desc: "Full URL of the target API endpoint" },
                  { field: "method", type: "string", required: false, desc: "HTTP method (default: GET)" },
                  { field: "headers", type: "object", required: false, desc: "Headers to forward to the target" },
                  { field: "body", type: "string", required: false, desc: "Request body to forward" },
                  { field: "timeoutMs", type: "number", required: false, desc: "Timeout in milliseconds (default: 30000)" },
                ].map(({ field, type, required, desc }) => (
                  <tr key={field} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-foreground whitespace-nowrap">{field}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-primary">{type}</td>
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
          <p className="text-sm text-muted-foreground mb-3">
            To include an x402 payment proof (after receiving a 402), add the <code className="font-mono bg-muted px-1 rounded text-xs">X-PAYMENT</code> header.
          </p>

          {/* Responses */}
          <SectionHeading id="responses">Response Schema</SectionHeading>
          <p className="text-sm text-muted-foreground mb-3">
            SelfHeal returns three types of responses depending on the outcome.
          </p>

          <h3 className="text-sm font-semibold text-foreground mb-2 mt-5">Pass-through (target returned 2xx/3xx) — FREE</h3>
          <p className="text-xs text-muted-foreground mb-2">
            The target response is wrapped in a JSON envelope. Zero cost.
          </p>
          <CodeBlock code={passthroughExample} className="mb-5" />

          <h3 className="text-sm font-semibold text-foreground mb-2">Payment Required (target failed, no payment) — 402</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Returns an x402 payment spec. The agent reads the price, pays, and retries with <code className="font-mono bg-muted px-1 rounded text-xs">X-PAYMENT</code> header.
          </p>
          <CodeBlock code={paymentRequiredExample} className="mb-5" />

          <h3 className="text-sm font-semibold text-foreground mb-2">Healed (target failed, payment verified, heal succeeded) — 200</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Payment is settled and the agent receives structured fix instructions.
          </p>
          <CodeBlock code={healedResponseExample} className="mb-4" />

          {/* Error categories */}
          <SectionHeading id="error-categories">Error Categories</SectionHeading>
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            {[
              { cat: "validation", desc: "Missing or malformed request fields (400, 422)" },
              { cat: "auth", desc: "Invalid or missing credentials (401, 403)" },
              { cat: "not_found", desc: "Resource does not exist at the given path (404)" },
              { cat: "rate_limit", desc: "Too many requests; safe to retry after a delay (429)" },
              { cat: "server_error", desc: "Destination server-side failure (500, 502, 503)" },
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
            Customize the snippet below with your target URL and method, then copy it into your agent.
          </p>

          {/* Customizer */}
          <div className="rounded-lg border border-border bg-card p-4 mb-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customize snippet</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Target URL</label>
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
                <div className="sm:col-span-2">
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
            Official SDKs handle the x402 payment flow automatically — detect 402, pay, retry.
            Use these instead of raw HTTP for a single-line integration.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-sm font-semibold text-foreground mb-1">Python</p>
              <CodeBlock code={`pip install 'graceful-fail[langchain]'`} className="mb-2" />
              <p className="text-xs text-muted-foreground">Sync + async client, LangChain tool, CrewAI compatible.</p>
              <a href="https://pypi.org/project/graceful-fail/" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                View on PyPI
              </a>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-sm font-semibold text-foreground mb-1">Node.js / TypeScript</p>
              <CodeBlock code={`npm install graceful-fail`} className="mb-2" />
              <p className="text-xs text-muted-foreground">Full TypeScript types, LangChain.js tool, ESM + CJS.</p>
              <a href="https://www.npmjs.com/package/graceful-fail" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                View on npm
              </a>
            </div>
          </div>

          {/* Pricing */}
          <SectionHeading id="pricing">Pricing</SectionHeading>
          <p className="text-sm text-muted-foreground mb-3">
            Outcome-based pricing via x402 micropayments in USDC. No subscriptions, no API keys.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tier</th>
                  <th className="text-left py-2 pr-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Error Types</th>
                  <th className="text-left py-2 pr-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Price (USDC)</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Charged When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { tier: "Pass-through", errors: "2xx/3xx (success)", price: "$0.00", when: "Never" },
                  { tier: "Simple", errors: "400, 404, 405, 422", price: "$0.001", when: "Heal succeeds" },
                  { tier: "Moderate", errors: "500, 502, 503, timeout", price: "$0.002", when: "Heal succeeds" },
                  { tier: "Complex", errors: "429, 403, auth errors", price: "$0.003\u2013$0.005", when: "Heal succeeds" },
                ].map(({ tier, errors, price, when }) => (
                  <tr key={tier} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 pr-6 text-sm font-medium text-foreground">{tier}</td>
                    <td className="py-2.5 pr-6 text-sm text-muted-foreground font-mono">{errors}</td>
                    <td className="py-2.5 pr-6 text-sm text-primary font-medium">{price}</td>
                    <td className="py-2.5 text-sm text-muted-foreground">{when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Networks: Base (mainnet) and Base Sepolia (testnet). Solana support coming soon.
          </p>
          <p className="text-xs text-muted-foreground">
            Rate limits: 30 req/min (free tier), 300 req/min (with valid x402 payment proof).
          </p>

          {/* Legacy API */}
          <SectionHeading id="legacy-api">Legacy API (v1)</SectionHeading>
          <p className="text-sm text-muted-foreground mb-3">
            The original <code className="font-mono bg-muted px-1 rounded text-xs">POST /api/proxy</code> endpoint
            with API key authentication is still available for backward compatibility.
            It uses <code className="font-mono bg-muted px-1 rounded text-xs">Authorization: Bearer gf_...</code> and
            <code className="font-mono bg-muted px-1 rounded text-xs">X-Destination-URL</code> headers.
            See the <Link href="/dashboard/keys" className="text-primary underline">Dashboard</Link> for API key management.
          </p>
          <p className="text-xs text-muted-foreground">
            New integrations should use the x402 endpoints above.
          </p>

          {/* OpenAPI Spec */}
          <SectionHeading id="openapi">OpenAPI Spec</SectionHeading>
          <p className="text-sm text-muted-foreground mb-4">
            A machine-readable OpenAPI 3.1 specification is available for import into Postman, Insomnia, or any OpenAPI-compatible tool.
          </p>
          <div className="flex flex-wrap gap-3 mb-5">
            <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="gap-2 text-sm">
                <Download className="w-4 h-4" />
                Download openapi.json
              </Button>
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
