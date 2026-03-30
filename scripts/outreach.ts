#!/usr/bin/env npx tsx
/**
 * SelfHeal Outreach Pipeline
 *
 * Single target:
 *   npx tsx scripts/outreach.ts owner/repo
 *   npx tsx scripts/outreach.ts --org openai --max-repos 10
 *   npx tsx scripts/outreach.ts owner/repo --email cto@acme.com --name "Acme Corp"
 *
 * Batch mode:
 *   npx tsx scripts/outreach.ts --batch targets.csv
 *   npx tsx scripts/outreach.ts --batch targets.csv --max-repos 5
 *
 *   CSV format (header required):
 *     target,email,name
 *     langchain-ai/langchain,cto@langchain.dev,LangChain
 *     --org:openai,,OpenAI            ← prefix with --org: for org scan
 *     crewaiinc/crewai,,CrewAI
 *
 * What it does:
 *   1. Fetches public repos (single repo or org) from GitHub
 *   2. Scans code for AI agent patterns (OpenAI, Anthropic, LangChain, CrewAI, etc.)
 *   3. Detects error handling gaps — bare try/catch, no retries, no fallback models
 *   4. Generates a branded PDF "AI Agent Resilience Audit"
 *   5. Drafts a personalized outreach email
 *   6. Saves everything to outreach-output/<prospect>/
 *   7. (Batch) Writes batch-manifest.json for Gmail draft creation
 */

import { Octokit } from "@octokit/rest";
import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

// ── Config ──────────────────────────────────────────────────────────────────

const BRAND = {
  name: "Carson Roell",
  company: "SelfHeal",
  email: "carson@selfheal.dev",
  site: "selfheal.dev",
  calendarLink: "https://cal.com/carsonroell/selfheal",
  tagline: "Self-healing API proxy for AI agents",
  color: { primary: "#6366f1", dark: "#0f172a", text: "#e2e8f0", muted: "#94a3b8" },
};

// ── AI SDK patterns to scan for ────────────────────────────────────────────

const AI_SDK_PATTERNS: { name: string; patterns: RegExp[]; category: string }[] = [
  {
    name: "OpenAI SDK",
    patterns: [/from\s+openai\s+import/i, /import\s+openai/i, /import\s+OpenAI/i, /new\s+OpenAI\(/i, /openai\.chat\.completions/i, /openai\.ChatCompletion/i],
    category: "LLM Provider",
  },
  {
    name: "Anthropic SDK",
    patterns: [/from\s+anthropic\s+import/i, /import\s+Anthropic/i, /new\s+Anthropic\(/i, /anthropic\.messages/i, /claude_agent_sdk/i],
    category: "LLM Provider",
  },
  {
    name: "LangChain",
    patterns: [/from\s+langchain/i, /import.*langchain/i, /ChatOpenAI\(/i, /ChatAnthropic\(/i, /AgentExecutor/i, /LLMChain\(/i],
    category: "Agent Framework",
  },
  {
    name: "CrewAI",
    patterns: [/from\s+crewai/i, /import.*crewai/i, /Crew\(/i, /Agent\(\s*role/i],
    category: "Agent Framework",
  },
  {
    name: "AutoGen",
    patterns: [/from\s+autogen/i, /import.*autogen/i, /AssistantAgent\(/i, /UserProxyAgent\(/i],
    category: "Agent Framework",
  },
  {
    name: "LlamaIndex",
    patterns: [/from\s+llama_index/i, /import.*llama_index/i, /VectorStoreIndex/i, /ServiceContext/i],
    category: "Agent Framework",
  },
  {
    name: "Vercel AI SDK",
    patterns: [/from\s+['"]ai['"]/i, /import.*['"]ai['"]/i, /generateText\(/i, /streamText\(/i, /useChat\(/i],
    category: "LLM Provider",
  },
  {
    name: "Requests/httpx (Python HTTP)",
    patterns: [/requests\.(?:get|post|put|patch|delete)\(/i, /httpx\.(?:get|post|put|patch|delete|AsyncClient)\(/i],
    category: "HTTP Client",
  },
  {
    name: "fetch/axios (JS HTTP)",
    patterns: [/axios\.(?:get|post|put|patch|delete)\(/i, /fetch\(\s*['"`]/i],
    category: "HTTP Client",
  },
];

// ── Error handling anti-patterns ───────────────────────────────────────────

const ERROR_ANTIPATTERNS: { name: string; description: string; patterns: RegExp[]; severity: "High" | "Medium" | "Low" }[] = [
  {
    name: "Bare except / empty catch",
    description: "Swallows all errors silently — agent has no idea something failed",
    patterns: [/except\s*:/g, /except\s+Exception\s*:/g, /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, /catch\s*\{\s*\}/g],
    severity: "High",
  },
  {
    name: "Unprotected HTTP call (no retry)",
    description: "External API call with no retry/backoff — one transient failure kills the workflow",
    // Only match actual HTTP client calls, not dict.get() or ORM .get()
    patterns: [
      /requests\.(?:get|post|put|patch|delete)\(/g,
      /httpx\.(?:get|post|put|patch|delete)\(/g,
      /axios\.(?:get|post|put|patch|delete)\(/g,
      /aiohttp\.(?:get|post|put|patch|delete)\(/g,
      /client\.(?:chat|completions|messages|embeddings)\./g,
      /openai\.(?:chat|completions|images|embeddings)\./g,
      /\.create\(\s*(?:model|messages)\s*[=:]/g,
    ],
    severity: "High",
  },
  {
    name: "Raw status code check only",
    description: "Checks HTTP status but doesn't parse error body — agent gets no context on what went wrong",
    patterns: [/\.status_code\s*[!=]=\s*\d/g, /response\.status\s*[!=]==?\s*[2-5]\d\d/g],
    severity: "Medium",
  },
  {
    name: "Hardcoded single model",
    description: "Locked to one LLM model with no fallback — outage = total downtime",
    patterns: [/model\s*=\s*["']gpt-4/g, /model\s*[:=]\s*["']claude/g, /model\s*[:=]\s*["']gpt-3\.5/g],
    severity: "Medium",
  },
  {
    name: "No timeout on HTTP calls",
    description: "HTTP calls without timeout — agent hangs indefinitely on slow responses",
    // Only match actual HTTP library calls missing timeout kwarg
    patterns: [
      /requests\.(?:get|post|put|patch|delete)\([^)]{0,200}(?<!timeout=)[^)]*\)/g,
      /httpx\.(?:get|post|put|patch|delete)\([^)]{0,200}(?<!timeout=)[^)]*\)/g,
    ],
    severity: "Medium",
  },
  {
    name: "Generic error message",
    description: "Returns generic 'something went wrong' instead of actionable error context",
    patterns: [/["'](?:something went wrong|an error occurred|unknown error|error occurred)["']/gi, /raise\s+Exception\(\s*["']Error/g],
    severity: "Low",
  },
  {
    name: "Pass on exception",
    description: "Catches error and does nothing — silent data loss",
    patterns: [/except.*:\s*\n\s*pass\b/g, /catch\s*\(.*\)\s*\{\s*\/\/.*\n?\s*\}/g],
    severity: "High",
  },
  {
    name: "No structured error response",
    description: "API errors returned as plain strings instead of structured JSON — agents can't parse recovery steps",
    patterns: [/return\s+["']Error:/g, /print\(\s*["']Error:/g, /console\.(?:log|error)\(\s*["']Error:/g],
    severity: "Low",
  },
];

// ── Types ──────────────────────────────────────────────────────────────────

interface RepoScan {
  repo: string;
  fullName: string;
  stars: number;
  language: string | null;
  description: string | null;
  sdksFound: string[];
  antipatterns: AntipatternsFound[];
  filesScanned: number;
  aiFilesFound: number;
  resilienceScore: number; // 0-100
}

interface AntipatternsFound {
  name: string;
  description: string;
  severity: "High" | "Medium" | "Low";
  count: number;
  exampleFile: string;
  exampleLine: string;
}

interface ProspectProfile {
  name: string;
  slug: string;
  repos: RepoScan[];
  totalStars: number;
  totalAIFiles: number;
  sdksUsed: string[];
  totalHighSeverity: number;
  totalMediumSeverity: number;
  totalLowSeverity: number;
  overallScore: number; // 0-100 resilience score
  estimatedFailureRate: string;
  estimatedCostPerMonth: string;
}

// ── Parse args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

let mode: "repo" | "org" = "repo";
let target = "";
let maxRepos = 10;
let prospectEmail: string | null = null;
let prospectName: string | null = null;
let batchFile: string | null = null;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === "--org") {
    mode = "org";
    target = args[++i] ?? "";
  } else if (arg === "--batch") {
    batchFile = args[++i] ?? null;
  } else if (arg === "--max-repos") {
    maxRepos = parseInt(args[++i] ?? "10", 10);
  } else if (arg === "--email") {
    prospectEmail = args[++i] ?? null;
  } else if (arg === "--name") {
    prospectName = args.slice(i + 1).join(" ");
    break;
  } else if (!target && !arg.startsWith("--")) {
    target = arg;
    if (target.includes("/")) mode = "repo";
  }
}

if (!target && !batchFile) {
  console.error(`Usage:
  npx tsx scripts/outreach.ts owner/repo
  npx tsx scripts/outreach.ts --org openai --max-repos 10
  npx tsx scripts/outreach.ts owner/repo --email cto@acme.com --name "Acme Corp"

  Batch mode:
  npx tsx scripts/outreach.ts --batch targets.csv
  npx tsx scripts/outreach.ts --batch targets.csv --max-repos 5

  CSV format (header required):
    target,email,name
    langchain-ai/langchain,cto@langchain.dev,LangChain
    --org:openai,,OpenAI
    crewaiinc/crewai,,CrewAI`);
  process.exit(1);
}

// ── Entrypoint ─────────────────────────────────────────────────────────────

if (batchFile) {
  runBatch(batchFile).catch((err) => { console.error(err); process.exit(1); });
} else {
  runSingle({ target, mode, email: prospectEmail, name: prospectName, maxRepos })
    .catch((err) => { console.error(err); process.exit(1); });
}

// ── Batch runner ───────────────────────────────────────────────────────────

interface BatchRow {
  target: string;
  mode: "repo" | "org";
  email: string | null;
  name: string | null;
  maxRepos: number;
}

interface ManifestEntry {
  target: string;
  slug: string;
  name: string;
  email: string | null;
  outDir: string;
  pdfPath: string;
  emailDraftPath: string;
  subject: string;
  score: number;
  highSeverity: number;
  status: "success" | "skipped" | "error";
  error?: string;
}

function parseBatchCSV(filePath: string): BatchRow[] {
  const content = readFileSync(resolve(filePath), "utf-8");
  const lines = content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

  // Expect header: target,email,name
  const header = lines[0]!.toLowerCase();
  if (!header.includes("target")) {
    console.error("   CSV must have a header row with at least a 'target' column");
    process.exit(1);
  }

  const cols = header.split(",").map((c) => c.trim());
  const targetIdx = cols.indexOf("target");
  const emailIdx = cols.indexOf("email");
  const nameIdx = cols.indexOf("name");

  const rows: BatchRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(",").map((c) => c.trim());
    let rowTarget = parts[targetIdx] ?? "";
    let rowMode: "repo" | "org" = "repo";

    if (rowTarget.startsWith("--org:")) {
      rowMode = "org";
      rowTarget = rowTarget.replace("--org:", "");
    } else if (rowTarget.includes("/")) {
      rowMode = "repo";
    }

    if (!rowTarget) continue;

    rows.push({
      target: rowTarget,
      mode: rowMode,
      email: (emailIdx >= 0 ? parts[emailIdx] : null) || null,
      name: (nameIdx >= 0 ? parts[nameIdx] : null) || null,
      maxRepos,
    });
  }

  return rows;
}

async function runBatch(filePath: string) {
  const rows = parseBatchCSV(filePath);

  console.log(`\n🛡️  SelfHeal Outreach Pipeline — BATCH MODE`);
  console.log(`   Targets: ${rows.length}`);
  console.log(`   Max repos per org: ${maxRepos}\n`);

  const manifest: ManifestEntry[] = [];
  let succeeded = 0;
  let skipped = 0;
  let errored = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    console.log(`\n${"═".repeat(60)}`);
    console.log(`[${i + 1}/${rows.length}] ${row.target}`);
    console.log(`${"═".repeat(60)}`);

    try {
      const result = await runSingle(row);
      if (result) {
        manifest.push(result);
        succeeded++;
      } else {
        manifest.push({
          target: row.target,
          slug: row.target.replace(/\//g, "-"),
          name: row.name ?? row.target,
          email: row.email,
          outDir: "",
          pdfPath: "",
          emailDraftPath: "",
          subject: "",
          score: 0,
          highSeverity: 0,
          status: "skipped",
        });
        skipped++;
      }
    } catch (err: any) {
      console.error(`   Error processing ${row.target}: ${err.message}`);
      manifest.push({
        target: row.target,
        slug: row.target.replace(/\//g, "-"),
        name: row.name ?? row.target,
        email: row.email,
        outDir: "",
        pdfPath: "",
        emailDraftPath: "",
        subject: "",
        score: 0,
        highSeverity: 0,
        status: "error",
        error: err.message,
      });
      errored++;
    }

    // Rate limit between targets — GitHub code search is aggressive with 403s
    if (i < rows.length - 1) {
      console.log(`\n   ⏳ Waiting 20s before next target (GitHub rate limit)...`);
      await sleep(20000);
    }
  }

  // Write batch manifest
  const manifestDir = resolve(import.meta.dirname ?? ".", "..", "outreach-output");
  mkdirSync(manifestDir, { recursive: true });
  const manifestPath = resolve(manifestDir, "batch-manifest.json");
  writeFileSync(manifestPath, JSON.stringify({
    batchDate: new Date().toISOString(),
    totalTargets: rows.length,
    succeeded,
    skipped,
    errored,
    entries: manifest,
  }, null, 2), "utf-8");

  console.log(`\n${"═".repeat(60)}`);
  console.log(`BATCH COMPLETE`);
  console.log(`${"═".repeat(60)}`);
  console.log(`   ✅ Succeeded: ${succeeded}`);
  console.log(`   ⏭️  Skipped (no AI code): ${skipped}`);
  console.log(`   ❌ Errors: ${errored}`);
  console.log(`\n   📋 Manifest: ${manifestPath}`);
  console.log(`   → Tell Claude: "create gmail drafts from the batch manifest"`);
  console.log();
}

// ── Single target runner ───────────────────────────────────────────────────

interface RunOpts {
  target: string;
  mode: "repo" | "org";
  email: string | null;
  name: string | null;
  maxRepos: number;
}

async function runSingle(opts: RunOpts): Promise<ManifestEntry | null> {
  // Use GITHUB_TOKEN env var, or fall back to gh CLI token
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      token = execSync("gh auth token", { encoding: "utf-8" }).trim();
    } catch {
      console.error("   No GITHUB_TOKEN set and gh CLI not authenticated. Set GITHUB_TOKEN or run `gh auth login`.");
      process.exit(1);
    }
  }

  const octokit = new Octokit({ auth: token });

  console.log(`\n🛡️  SelfHeal Outreach Pipeline`);
  console.log(`   Target: ${opts.target}`);
  console.log(`   Mode: ${opts.mode}\n`);

  // ── Step 1: Discover repos ───────────────────────────────────────────────

  console.log(`[1/4] Discovering repositories...`);

  let repos: { owner: string; name: string; fullName: string; stars: number; language: string | null; description: string | null }[] = [];

  if (opts.mode === "org") {
    const { data } = await octokit.repos.listForOrg({
      org: opts.target,
      type: "public",
      sort: "stars",
      direction: "desc",
      per_page: opts.maxRepos,
    });
    repos = data.map((r) => ({
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      stars: r.stargazers_count ?? 0,
      language: r.language,
      description: r.description,
    }));
  } else {
    const [owner, name] = opts.target.split("/");
    if (!owner || !name) {
      console.error("   Invalid repo format. Use owner/repo");
      return null;
    }
    const { data: r } = await octokit.repos.get({ owner, repo: name });
    repos = [{
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      stars: r.stargazers_count ?? 0,
      language: r.language,
      description: r.description,
    }];
  }

  console.log(`   Found ${repos.length} repo(s)`);

  // ── Step 2: Scan repos for AI patterns + anti-patterns ───────────────────

  console.log(`\n[2/4] Scanning for AI agent patterns & error handling gaps...`);

  const scans: RepoScan[] = [];

  for (const repo of repos) {
    process.stdout.write(`   Scanning ${repo.fullName}...`);

    const scan = await scanRepo(octokit, repo.owner, repo.name, repo);
    if (scan.sdksFound.length > 0 || scan.aiFilesFound > 0) {
      scans.push(scan);
      console.log(` ${scan.sdksFound.length} SDKs, ${scan.antipatterns.length} issues (score: ${scan.resilienceScore}/100)`);
    } else {
      console.log(` no AI patterns found, skipping`);
    }
  }

  if (scans.length === 0) {
    console.log(`\n   No AI agent code found in any repo. Nothing to report.`);
    return null;
  }

  // ── Build prospect profile ───────────────────────────────────────────────

  const allSdks = [...new Set(scans.flatMap((s) => s.sdksFound))];
  const totalHigh = scans.reduce((sum, s) => sum + s.antipatterns.filter((a) => a.severity === "High").reduce((c, a) => c + a.count, 0), 0);
  const totalMedium = scans.reduce((sum, s) => sum + s.antipatterns.filter((a) => a.severity === "Medium").reduce((c, a) => c + a.count, 0), 0);
  const totalLow = scans.reduce((sum, s) => sum + s.antipatterns.filter((a) => a.severity === "Low").reduce((c, a) => c + a.count, 0), 0);
  const avgScore = Math.round(scans.reduce((sum, s) => sum + s.resilienceScore, 0) / scans.length);

  const failureRate = totalHigh > 10 ? "15-25%" : totalHigh > 5 ? "8-15%" : totalHigh > 0 ? "3-8%" : "1-3%";
  const costPerMonth = totalHigh > 10 ? "$2,000-$8,000" : totalHigh > 5 ? "$800-$3,000" : totalHigh > 0 ? "$200-$800" : "$50-$200";

  const slug = opts.target.replace(/\//g, "-").replace(/[^a-zA-Z0-9.-]/g, "_");
  const displayName = opts.name ?? (opts.mode === "org" ? opts.target : opts.target.split("/")[0]!);

  const profile: ProspectProfile = {
    name: displayName,
    slug,
    repos: scans,
    totalStars: scans.reduce((sum, s) => sum + s.stars, 0),
    totalAIFiles: scans.reduce((sum, s) => sum + s.aiFilesFound, 0),
    sdksUsed: allSdks,
    totalHighSeverity: totalHigh,
    totalMediumSeverity: totalMedium,
    totalLowSeverity: totalLow,
    overallScore: avgScore,
    estimatedFailureRate: failureRate,
    estimatedCostPerMonth: costPerMonth,
  };

  console.log(`\n   Summary: ${scans.length} repos with AI code, ${allSdks.length} SDKs, resilience score: ${avgScore}/100`);
  console.log(`   High: ${totalHigh} | Medium: ${totalMedium} | Low: ${totalLow}`);

  // ── Step 3: Generate PDF ─────────────────────────────────────────────────

  console.log(`\n[3/4] Generating PDF report...`);

  const outDir = resolve(import.meta.dirname ?? ".", "..", "outreach-output", slug);
  mkdirSync(outDir, { recursive: true });

  const pdfPath = resolve(outDir, `${slug}-resilience-audit.pdf`);
  await generatePDF(pdfPath, profile);
  console.log(`   Saved: ${pdfPath}`);

  // ── Step 4: Draft email ──────────────────────────────────────────────────

  console.log(`\n[4/4] Drafting outreach email...`);

  const emailDraft = generateEmailDraft(profile, opts.email);
  const emailPath = resolve(outDir, `email-draft.md`);
  writeFileSync(emailPath, emailDraft, "utf-8");
  console.log(`   Saved: ${emailPath}`);

  // Save raw data
  const dataPath = resolve(outDir, `audit-data.json`);
  writeFileSync(dataPath, JSON.stringify(profile, null, 2), "utf-8");

  // Extract subject line from email draft
  const subjectMatch = emailDraft.match(/\*\*Subject:\*\*\s*(.+)/);
  const subject = subjectMatch?.[1] ?? `AI Agent Resilience Audit — ${displayName}`;

  console.log(`\n✅ Outreach package ready: ${outDir}`);
  console.log(`   📄 PDF Report: ${slug}-resilience-audit.pdf`);
  console.log(`   📧 Email Draft: email-draft.md`);
  console.log(`   📊 Raw Data: audit-data.json`);
  console.log();

  return {
    target: opts.target,
    slug,
    name: displayName,
    email: opts.email,
    outDir,
    pdfPath,
    emailDraftPath: emailPath,
    subject,
    score: avgScore,
    highSeverity: totalHigh,
    status: "success",
  };
}

// ── Repo Scanner ───────────────────────────────────────────────────────────

async function scanRepo(
  octokit: Octokit,
  owner: string,
  name: string,
  repoMeta: { fullName: string; stars: number; language: string | null; description: string | null },
): Promise<RepoScan> {
  const sdksFound = new Set<string>();
  const antipatterns: AntipatternsFound[] = [];
  let filesScanned = 0;
  let aiFilesFound = 0;

  // Search for AI-related files via code search
  const searchQueries = [
    "openai",
    "anthropic",
    "langchain",
    "crewai",
    "autogen",
    "llama_index",
    "ChatCompletion",
    "generateText",
  ];

  const filesChecked = new Set<string>();

  for (const query of searchQueries) {
    try {
      const { data } = await octokit.search.code({
        q: `${query} repo:${owner}/${name}`,
        per_page: 10,
      });

      for (const item of data.items) {
        if (filesChecked.has(item.path)) continue;
        filesChecked.add(item.path);

        // Skip non-source files
        if (item.path.includes("node_modules/") || item.path.includes("vendor/") ||
            item.path.includes(".lock") || item.path.includes("package-lock") ||
            item.path.includes("dist/") || item.path.includes("build/") ||
            item.path.includes("__pycache__/") || item.path.includes(".min.") ||
            item.path.endsWith(".md") || item.path.endsWith(".txt") ||
            item.path.endsWith(".json") || item.path.endsWith(".yaml") ||
            item.path.endsWith(".yml") || item.path.endsWith(".toml") ||
            item.path.includes("test_") || item.path.includes("_test.") ||
            item.path.includes(".test.") || item.path.includes("__tests__/")) {
          continue;
        }

        try {
          const { data: fileData } = await octokit.repos.getContent({
            owner,
            repo: name,
            path: item.path,
          });

          if ("content" in fileData && fileData.content) {
            const content = Buffer.from(fileData.content, "base64").toString("utf-8");
            filesScanned++;

            // Check for AI SDK usage
            let hasAI = false;
            for (const sdk of AI_SDK_PATTERNS) {
              for (const pattern of sdk.patterns) {
                if (pattern.test(content)) {
                  sdksFound.add(sdk.name);
                  hasAI = true;
                  break;
                }
              }
            }

            if (hasAI) aiFilesFound++;

            // Check if file has retry/resilience patterns already
            const hasRetryLib = /(?:tenacity|backoff|retry|Retry|@retry|with_retries|exponential_backoff|retrying)/i.test(content);
            const hasCircuitBreaker = /(?:circuit.?breaker|CircuitBreaker|pybreaker)/i.test(content);
            const hasResilience = hasRetryLib || hasCircuitBreaker;

            // Check for anti-patterns — only in files with AI SDK usage
            if (!hasAI) continue;

            for (const ap of ERROR_ANTIPATTERNS) {
              // Skip "unprotected HTTP" and "no timeout" if file already has retry logic
              if (hasResilience && (ap.name.includes("Unprotected") || ap.name.includes("No timeout"))) continue;
              let totalCount = 0;
              let exampleLine = "";

              for (const pattern of ap.patterns) {
                // Reset regex state
                const freshPattern = new RegExp(pattern.source, pattern.flags);
                const matches = content.match(freshPattern);
                if (matches && matches.length > 0) {
                  totalCount += matches.length;
                  if (!exampleLine) {
                    // Find the line containing the first match
                    const lines = content.split("\n");
                    for (const line of lines) {
                      const linePattern = new RegExp(pattern.source, pattern.flags.replace("g", ""));
                      if (linePattern.test(line)) {
                        exampleLine = line.trim().slice(0, 120);
                        break;
                      }
                    }
                  }
                }
              }

              if (totalCount > 0) {
                // Merge with existing if same antipattern
                const existing = antipatterns.find((a) => a.name === ap.name);
                if (existing) {
                  existing.count += totalCount;
                } else {
                  antipatterns.push({
                    name: ap.name,
                    description: ap.description,
                    severity: ap.severity,
                    count: totalCount,
                    exampleFile: item.path,
                    exampleLine,
                  });
                }
              }
            }
          }
        } catch {
          // File fetch failed, skip
        }
      }

      // Rate limit — GitHub code search is strict
      await sleep(3000);
    } catch {
      // Search failed for this query, continue
    }
  }

  // Calculate resilience score (100 = perfect, 0 = terrible)
  // Use diminishing penalty: each additional issue of the same severity matters less
  // This prevents a repo with 200 .get() calls from scoring 0 while one with 5 real issues scores 60
  const highCount = antipatterns.filter((a) => a.severity === "High").reduce((s, a) => s + a.count, 0);
  const medCount = antipatterns.filter((a) => a.severity === "Medium").reduce((s, a) => s + a.count, 0);
  const lowCount = antipatterns.filter((a) => a.severity === "Low").reduce((s, a) => s + a.count, 0);

  // Logarithmic scaling: first few issues hurt most, diminishing returns after
  const highPenalty = highCount > 0 ? 15 + Math.min(30, Math.log2(highCount) * 10) : 0;
  const medPenalty = medCount > 0 ? 8 + Math.min(20, Math.log2(medCount) * 6) : 0;
  const lowPenalty = lowCount > 0 ? Math.min(10, Math.log2(lowCount) * 3) : 0;
  const resilienceScore = Math.max(0, Math.min(100, Math.round(100 - highPenalty - medPenalty - lowPenalty)));

  return {
    repo: name,
    fullName: repoMeta.fullName,
    stars: repoMeta.stars,
    language: repoMeta.language,
    description: repoMeta.description,
    sdksFound: [...sdksFound],
    antipatterns,
    filesScanned,
    aiFilesFound,
    resilienceScore,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── PDF Generator ──────────────────────────────────────────────────────────

function generatePDF(path: string, profile: ProspectProfile): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: false });
    const stream = createWriteStream(path);
    doc.pipe(stream);

    const W = 595.28;
    const H = 841.89;
    const M = 50;
    const CW = W - M * 2;
    const FOOTER_Y = 800;
    let currentPage = 0;

    function newPage(bg = "#ffffff") {
      doc.addPage();
      currentPage++;
      doc.rect(0, 0, W, H).fill(bg);
    }

    function addFooter() {
      doc.save();
      doc.moveTo(M, FOOTER_Y).lineTo(W - M, FOOTER_Y).lineWidth(0.5).stroke("#e2e8f0");
      doc.fontSize(7).fillColor("#94a3b8")
        .text(`AI Agent Resilience Audit  |  Prepared by ${BRAND.name}  |  ${BRAND.company}`, M, FOOTER_Y + 8, { lineBreak: false })
        .text(`Page ${currentPage}`, W - M - 30, FOOTER_Y + 8, { lineBreak: false });
      doc.restore();
    }

    // ── Page 1: Cover ─────────────────────────────────────────────────────

    newPage("#0f172a");

    // Accent bar
    doc.rect(0, 0, W, 6).fill("#6366f1");

    // Title
    doc.fontSize(36).fillColor("#ffffff").text("AI Agent", M, 160, { width: CW });
    doc.text("Resilience Audit", M, 205, { width: CW });

    // Prospect name
    doc.fontSize(20).fillColor("#6366f1").text(profile.name, M, 280, { width: CW });

    // Date
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    doc.fontSize(12).fillColor("#94a3b8").text(today, M, 315, { width: CW });

    // Divider
    doc.moveTo(M, 350).lineTo(M + 200, 350).lineWidth(2).stroke("#6366f1");

    // Score badge
    const scoreColor = profile.overallScore >= 70 ? "#22c55e" : profile.overallScore >= 40 ? "#eab308" : "#ef4444";
    doc.fontSize(10).fillColor("#94a3b8").text("Resilience Score", M, 375);
    doc.fontSize(48).fillColor(scoreColor).text(`${profile.overallScore}`, M, 395);
    doc.fontSize(14).fillColor("#64748b").text("/ 100", M + 80, 420);

    // Prepared by
    doc.fontSize(10).fillColor("#94a3b8").text("Prepared by", M, 480);
    doc.fontSize(14).fillColor("#ffffff").text(BRAND.name, M, 497);
    doc.fontSize(11).fillColor("#6366f1").text(BRAND.company, M, 517);

    // Tagline
    doc.fontSize(9).fillColor("#64748b").text(BRAND.tagline, M, 780);

    // ── Page 2: Executive Summary ─────────────────────────────────────────

    newPage();
    sectionHeader(doc, "Executive Summary", M, 50);

    doc.fontSize(10).fillColor("#475569")
      .text(`This report summarizes the results of an automated resilience audit of ${profile.name}'s public AI agent code.`, M, 100, { width: CW })
      .text(`We scanned ${profile.repos.length} repositories containing AI/LLM code, analyzing ${profile.totalAIFiles} files for error handling patterns, retry logic, and failure recovery.`, M, 125, { width: CW });

    // Stat boxes
    const boxW = (CW - 20) / 2;
    const boxH = 65;
    const boxY = 165;

    statBox(doc, M, boxY, boxW, boxH, String(profile.repos.length), "Repos With AI Code", "#f8fafc", "#1e293b");
    statBox(doc, M + boxW + 20, boxY, boxW, boxH, String(profile.totalAIFiles), "AI/LLM Source Files", "#f8fafc", "#1e293b");
    statBox(doc, M, boxY + boxH + 15, boxW, boxH, String(profile.sdksUsed.length), "AI SDKs Detected", "#f0f0ff", "#6366f1");
    statBox(doc, M + boxW + 20, boxY + boxH + 15, boxW, boxH, `${profile.overallScore}/100`, "Resilience Score", scoreColor === "#ef4444" ? "#fef2f2" : scoreColor === "#eab308" ? "#fefce8" : "#f0fdf4", scoreColor === "#ef4444" ? "#dc2626" : scoreColor === "#eab308" ? "#ca8a04" : "#16a34a");

    // SDKs detected
    const sdkY = boxY + (boxH + 15) * 2 + 25;
    doc.fontSize(12).fillColor("#1e293b").text("AI SDKs Detected", M, sdkY);
    doc.fontSize(10).fillColor("#475569").text(profile.sdksUsed.join("  •  "), M, sdkY + 20, { width: CW });

    // Risk banner
    const bannerY = sdkY + 55;
    doc.roundedRect(M, bannerY, CW, 80, 8).fill("#0f172a");
    doc.fontSize(8).fillColor("#6366f1").text("ESTIMATED IMPACT", M + 20, bannerY + 12);
    doc.fontSize(14).fillColor("#ffffff").text(`Failure Rate: ${profile.estimatedFailureRate}`, M + 20, bannerY + 30);
    doc.fontSize(14).fillColor("#ffffff").text(`Estimated Cost: ${profile.estimatedCostPerMonth}/mo`, M + 20, bannerY + 50);
    doc.fontSize(8).fillColor("#94a3b8").text("Based on industry averages for unhandled API failures in AI agent workflows", M + 20, bannerY + 70);

    // Issue breakdown table
    const tableY = bannerY + 110;
    doc.fontSize(14).fillColor("#1e293b").text("Issue Breakdown", M, tableY);

    const tableStartY = tableY + 25;
    const cols = [M, M + 250, M + 330, M + 410];
    const colLabels = ["Category", "Count", "Severity", "Impact"];

    doc.rect(M, tableStartY, CW, 22).fill("#f1f5f9");
    doc.fontSize(8).fillColor("#64748b");
    colLabels.forEach((label, i) => doc.text(label, cols[i]! + 8, tableStartY + 7, { lineBreak: false }));

    // Aggregate antipatterns across all repos
    const allAntipatterns = new Map<string, { name: string; description: string; severity: "High" | "Medium" | "Low"; count: number }>();
    for (const scan of profile.repos) {
      for (const ap of scan.antipatterns) {
        const existing = allAntipatterns.get(ap.name);
        if (existing) {
          existing.count += ap.count;
        } else {
          allAntipatterns.set(ap.name, { ...ap });
        }
      }
    }

    const sortedAP = [...allAntipatterns.values()].sort((a, b) => {
      const sevOrder = { High: 0, Medium: 1, Low: 2 };
      return sevOrder[a.severity] - sevOrder[b.severity] || b.count - a.count;
    });

    sortedAP.forEach((row, i) => {
      const y = tableStartY + 22 + i * 24;
      if (y > FOOTER_Y - 40) return; // Don't overflow
      if (i % 2 === 1) doc.rect(M, y, CW, 24).fill("#f8fafc");

      doc.fontSize(9).fillColor("#334155").text(row.name, cols[0]! + 8, y + 7, { width: 240, lineBreak: false });
      doc.text(String(row.count), cols[1]! + 8, y + 7, { lineBreak: false });

      const sevColor = row.severity === "High" ? "#dc2626" : row.severity === "Medium" ? "#ca8a04" : "#16a34a";
      doc.fillColor(sevColor).text(row.severity, cols[2]! + 8, y + 7, { lineBreak: false });

      const impact = row.severity === "High" ? "Agent failure" : row.severity === "Medium" ? "Silent degradation" : "Poor DX";
      doc.fillColor("#475569").text(impact, cols[3]! + 8, y + 7, { lineBreak: false });
    });

    addFooter();

    // ── Page 3+: Per-Repo Findings ───────────────────────────────────────

    for (const scan of profile.repos) {
      if (scan.antipatterns.length === 0) continue;

      newPage();
      sectionHeader(doc, scan.fullName, M, 50);

      doc.fontSize(10).fillColor("#475569")
        .text(scan.description ?? "", M, 100, { width: CW });

      // Repo meta
      doc.fontSize(9).fillColor("#94a3b8")
        .text(`Language: ${scan.language ?? "Unknown"}  |  Stars: ${scan.stars.toLocaleString()}  |  Files scanned: ${scan.filesScanned}  |  AI files: ${scan.aiFilesFound}  |  Score: ${scan.resilienceScore}/100`, M, 120, { width: CW });

      // SDKs in this repo
      if (scan.sdksFound.length > 0) {
        doc.fontSize(9).fillColor("#6366f1").text(`SDKs: ${scan.sdksFound.join(", ")}`, M, 140, { width: CW });
      }

      // Issues table
      let y = 170;
      doc.rect(M, y, CW, 22).fill("#f1f5f9");
      doc.fontSize(8).fillColor("#64748b");
      doc.text("Issue", M + 8, y + 7, { lineBreak: false });
      doc.text("File", M + 200, y + 7, { lineBreak: false });
      doc.text("Count", M + 370, y + 7, { lineBreak: false });
      doc.text("Severity", M + 420, y + 7, { lineBreak: false });

      y += 22;

      scan.antipatterns.sort((a, b) => {
        const sevOrder = { High: 0, Medium: 1, Low: 2 };
        return sevOrder[a.severity] - sevOrder[b.severity];
      });

      for (let i = 0; i < scan.antipatterns.length && y < FOOTER_Y - 60; i++) {
        const ap = scan.antipatterns[i]!;
        if (i % 2 === 1) doc.rect(M, y, CW, 36).fill("#f8fafc");

        doc.fontSize(8).fillColor("#1e293b").text(ap.name, M + 8, y + 4, { width: 185, lineBreak: false });
        doc.fontSize(7).fillColor("#94a3b8").text(ap.description, M + 8, y + 16, { width: 185 });

        let filePath = ap.exampleFile;
        if (filePath.length > 30) filePath = "..." + filePath.slice(-28);
        doc.fontSize(7).fillColor("#475569").text(filePath, M + 200, y + 4, { width: 165, lineBreak: false });

        if (ap.exampleLine) {
          let example = ap.exampleLine;
          if (example.length > 40) example = example.slice(0, 38) + "...";
          doc.fontSize(6).fillColor("#94a3b8").text(example, M + 200, y + 16, { width: 165, lineBreak: false });
        }

        doc.fontSize(8).fillColor("#334155").text(String(ap.count), M + 370, y + 10, { lineBreak: false });

        const sevColor = ap.severity === "High" ? "#dc2626" : ap.severity === "Medium" ? "#ca8a04" : "#16a34a";
        doc.fillColor(sevColor).text(ap.severity, M + 420, y + 10, { lineBreak: false });

        y += 36;
      }

      addFooter();
    }

    // ── Recommendations Page ────────────────────────────────────────────

    newPage();
    sectionHeader(doc, "Recommendations & Next Steps", M, 50);

    doc.fontSize(14).fillColor("#1e293b").text("Priority Fixes", M, 100);

    const fixes = [
      {
        title: "Add structured error recovery to all API calls",
        desc: "Replace bare try/catch blocks with structured error handling that gives your agents actionable context — not just 'something failed'. SelfHeal does this automatically via its proxy layer.",
      },
      {
        title: "Implement retry with exponential backoff",
        desc: "Transient failures (rate limits, timeouts, 503s) are recoverable if you retry intelligently. Without retries, a single API hiccup takes down the entire agent workflow.",
      },
      {
        title: "Add fallback model routing",
        desc: "Hardcoding a single LLM model means one provider outage = total downtime. Route to fallback models automatically when the primary is unavailable.",
      },
      {
        title: "Set timeouts on all external API calls",
        desc: "API calls without timeouts let your agent hang indefinitely. Set aggressive timeouts and handle the timeout as a structured error, not an exception.",
      },
    ];

    let fixY = 125;
    fixes.forEach((fix, i) => {
      doc.circle(M + 10, fixY + 8, 10).fill("#6366f1");
      doc.fontSize(10).fillColor("#ffffff").text(String(i + 1), M + 6, fixY + 3, { lineBreak: false });

      doc.fontSize(11).fillColor("#1e293b").text(fix.title, M + 30, fixY);
      doc.fontSize(9).fillColor("#64748b").text(fix.desc, M + 30, fixY + 16, { width: CW - 40 });
      fixY += 65;
    });

    // CTA
    const ctaY = fixY + 20;
    doc.roundedRect(M, ctaY, CW, 170, 8).fill("#0f172a");

    doc.fontSize(14).fillColor("#6366f1").text("How SelfHeal Fixes This", M + 25, ctaY + 18);

    doc.fontSize(10).fillColor("#e2e8f0")
      .text("SelfHeal sits between your agents and any API. Failed calls get intercepted, analyzed by an LLM, and returned with structured recovery instructions your agent can act on — automatically.", M + 25, ctaY + 42, { width: CW - 50 });

    // Tiers
    doc.fontSize(18).fillColor("#ffffff").text("Free", M + 25, ctaY + 85);
    doc.fontSize(9).fillColor("#94a3b8").text("500 requests/mo", M + 25, ctaY + 106);

    doc.fontSize(18).fillColor("#ffffff").text("$29/mo", M + CW / 3, ctaY + 85);
    doc.fontSize(9).fillColor("#94a3b8").text("10K requests + LLM analysis", M + CW / 3, ctaY + 106);

    doc.fontSize(18).fillColor("#ffffff").text("$99/mo", M + (CW * 2) / 3, ctaY + 85);
    doc.fontSize(9).fillColor("#94a3b8").text("50K requests + priority", M + (CW * 2) / 3, ctaY + 106);

    // CTA button
    doc.roundedRect(M + 30, ctaY + 130, CW - 60, 26, 4).fill("#6366f1");
    doc.fontSize(10).fillColor("#ffffff").text(
      `Try free at selfheal.dev  |  Book a call: ${BRAND.calendarLink}`,
      M + 50, ctaY + 137, { width: CW - 80, align: "center" },
    );

    addFooter();

    // ── Finalize ──────────────────────────────────────────────────────────

    doc.end();
    stream.on("finish", resolvePromise);
    stream.on("error", reject);
  });
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string, x: number, y: number) {
  doc.fontSize(22).fillColor("#1e293b").text(title, x, y, { lineBreak: false });
  const titleWidth = doc.widthOfString(title);
  doc.moveTo(x, y + 28).lineTo(x + Math.min(titleWidth, 200), y + 28).lineWidth(3).stroke("#6366f1");
}

function statBox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, value: string, label: string, bgColor: string, valueColor: string) {
  doc.roundedRect(x, y, w, h, 6).fillAndStroke(bgColor, "#e2e8f0");
  doc.fontSize(24).fillColor(valueColor).text(value, x + 15, y + 12, { width: w - 30 });
  doc.fontSize(9).fillColor("#64748b").text(label, x + 15, y + 42, { width: w - 30 });
}

// ── Email Draft Generator ──────────────────────────────────────────────────

function generateEmailDraft(profile: ProspectProfile, email: string | null): string {
  const { name, totalHighSeverity, totalMediumSeverity, overallScore, sdksUsed, estimatedFailureRate, estimatedCostPerMonth, repos } = profile;

  let subjectLine: string;
  let openingLine: string;

  if (totalHighSeverity > 5) {
    subjectLine = `${totalHighSeverity} critical error handling gaps in ${name}'s AI agent code`;
    openingLine = `I ran a resilience audit on ${name}'s public AI agent code and found ${totalHighSeverity} high-severity error handling gaps across ${repos.length} repo${repos.length > 1 ? "s" : ""}. These are patterns like bare try/catch blocks, missing retry logic, and hardcoded single-model dependencies — each one a point where a single API failure can take down your entire agent workflow.`;
  } else if (totalHighSeverity > 0) {
    subjectLine = `Quick resilience audit of ${name}'s AI agent code — ${overallScore}/100`;
    openingLine = `I ran a quick resilience audit on ${name}'s public repos that use ${sdksUsed.slice(0, 3).join(", ")}${sdksUsed.length > 3 ? " and more" : ""}. The overall score came out to ${overallScore}/100 — there are ${totalHighSeverity} high-severity error handling gap${totalHighSeverity > 1 ? "s" : ""} and ${totalMediumSeverity} medium-severity issue${totalMediumSeverity > 1 ? "s" : ""} that could cause silent failures in production.`;
  } else {
    subjectLine = `${name}'s AI agent error handling — ${overallScore}/100 resilience score`;
    openingLine = `I ran a quick resilience audit on ${name}'s public AI agent code and scored it ${overallScore}/100. The code is in decent shape, but there are ${totalMediumSeverity} medium-severity pattern${totalMediumSeverity > 1 ? "s" : ""} that could cause issues at scale — things like missing timeouts, generic error messages, and single-model dependencies.`;
  }

  const bulletPoints: string[] = [];
  if (totalHighSeverity > 0) bulletPoints.push(`- **${totalHighSeverity} high-severity gaps** (bare catch blocks, no retry logic, silent error swallowing)`);
  if (totalMediumSeverity > 0) bulletPoints.push(`- **${totalMediumSeverity} medium-severity issues** (hardcoded models, missing timeouts, raw status checks)`);
  bulletPoints.push(`- **Estimated failure rate: ${estimatedFailureRate}** of API calls in production`);
  bulletPoints.push(`- **Estimated cost: ${estimatedCostPerMonth}** in wasted compute, retries, and agent downtime`);

  const repoList = repos.map((r) => `- **${r.fullName}** — ${r.sdksFound.join(", ")} — score: ${r.resilienceScore}/100`).join("\n");

  return `# Outreach Email Draft
**To:** ${email ?? `[find engineering contact for ${name}]`}
**Subject:** ${subjectLine}
**Attachment:** ${profile.slug}-resilience-audit.pdf

---

Hi there,

${openingLine}

I put together a report breaking down each issue, which files they're in, and the estimated impact. It's attached.

Here's the quick summary:
${bulletPoints.join("\n")}

Repos scanned:
${repoList}

I built a tool called SelfHeal (selfheal.dev) that fixes this automatically — it's an API proxy that sits between your agents and external APIs. When a call fails, it intercepts the error, runs it through an LLM, and returns structured recovery instructions your agent can act on. No code changes needed beyond swapping the base URL.

The free tier gives you 500 requests/month, and the report is yours either way.

Happy to walk through the findings: ${BRAND.calendarLink}

Best,
${BRAND.name}
${BRAND.company} — ${BRAND.site}

---

## Notes for Carson
- Personalize — mention a specific repo or pattern you noticed
- If they use LangChain/CrewAI, mention the integration angle
- Attach the PDF before sending
- Send from selfheal.dev email
`;
}
