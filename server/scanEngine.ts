/**
 * Resilience Scanner — shared scanning logic for outreach + public tool.
 * Scans GitHub repos for AI SDK usage and error handling anti-patterns.
 */

import { Octokit } from "@octokit/rest";
import { execSync } from "child_process";

// ── AI SDK patterns ────────────────────────────────────────────────────────

const AI_SDK_PATTERNS = [
  { name: "OpenAI SDK", patterns: [/from\s+openai\s+import/i, /import\s+openai/i, /import\s+OpenAI/i, /new\s+OpenAI\(/i, /openai\.chat\.completions/i, /openai\.ChatCompletion/i], category: "LLM Provider" },
  { name: "Anthropic SDK", patterns: [/from\s+anthropic\s+import/i, /import\s+Anthropic/i, /new\s+Anthropic\(/i, /anthropic\.messages/i], category: "LLM Provider" },
  { name: "LangChain", patterns: [/from\s+langchain/i, /import.*langchain/i, /ChatOpenAI\(/i, /ChatAnthropic\(/i, /AgentExecutor/i], category: "Agent Framework" },
  { name: "CrewAI", patterns: [/from\s+crewai/i, /import.*crewai/i, /Crew\(/i, /Agent\(\s*role/i], category: "Agent Framework" },
  { name: "AutoGen", patterns: [/from\s+autogen/i, /import.*autogen/i, /AssistantAgent\(/i, /UserProxyAgent\(/i], category: "Agent Framework" },
  { name: "LlamaIndex", patterns: [/from\s+llama_index/i, /import.*llama_index/i, /VectorStoreIndex/i], category: "Agent Framework" },
  { name: "Vercel AI SDK", patterns: [/from\s+['"]ai['"]/i, /generateText\(/i, /streamText\(/i], category: "LLM Provider" },
  { name: "Requests/httpx", patterns: [/requests\.(?:get|post|put|patch|delete)\(/i, /httpx\.(?:get|post|put|patch|delete|AsyncClient)\(/i], category: "HTTP Client" },
  { name: "fetch/axios", patterns: [/axios\.(?:get|post|put|patch|delete)\(/i], category: "HTTP Client" },
];

// ── Error anti-patterns ────────────────────────────────────────────────────

const ERROR_ANTIPATTERNS: { name: string; description: string; patterns: RegExp[]; severity: "High" | "Medium" | "Low" }[] = [
  { name: "Bare except / empty catch", description: "Swallows all errors silently — agent has no idea something failed", patterns: [/except\s*:/g, /except\s+Exception\s*:/g, /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g], severity: "High" },
  { name: "Unprotected HTTP call (no retry)", description: "External API call with no retry/backoff — one transient failure kills the workflow", patterns: [/requests\.(?:get|post|put|patch|delete)\(/g, /httpx\.(?:get|post|put|patch|delete)\(/g, /axios\.(?:get|post|put|patch|delete)\(/g, /client\.(?:chat|completions|messages|embeddings)\./g, /openai\.(?:chat|completions|images|embeddings)\./g, /\.create\(\s*(?:model|messages)\s*[=:]/g], severity: "High" },
  { name: "Raw status code check only", description: "Checks HTTP status but doesn't parse error body — agent gets no context", patterns: [/\.status_code\s*[!=]=\s*\d/g, /response\.status\s*[!=]==?\s*[2-5]\d\d/g], severity: "Medium" },
  { name: "Hardcoded single model", description: "Locked to one LLM model with no fallback — outage = total downtime", patterns: [/model\s*=\s*["']gpt-4/g, /model\s*[:=]\s*["']claude/g, /model\s*[:=]\s*["']gpt-3\.5/g], severity: "Medium" },
  { name: "No timeout on HTTP calls", description: "HTTP calls without timeout — agent hangs indefinitely on slow responses", patterns: [/requests\.(?:get|post|put|patch|delete)\([^)]{0,200}(?<!timeout=)[^)]*\)/g, /httpx\.(?:get|post|put|patch|delete)\([^)]{0,200}(?<!timeout=)[^)]*\)/g], severity: "Medium" },
  { name: "Generic error message", description: "Returns generic 'something went wrong' instead of actionable error context", patterns: [/["'](?:something went wrong|an error occurred|unknown error|error occurred)["']/gi, /raise\s+Exception\(\s*["']Error/g], severity: "Low" },
  { name: "Pass on exception", description: "Catches error and does nothing — silent data loss", patterns: [/except.*:\s*\n\s*pass\b/g], severity: "High" },
  { name: "No structured error response", description: "API errors returned as plain strings — agents can't parse recovery steps", patterns: [/return\s+["']Error:/g, /print\(\s*["']Error:/g, /console\.(?:log|error)\(\s*["']Error:/g], severity: "Low" },
];

// ── Types ──────────────────────────────────────────────────────────────────

export interface Antipattern {
  name: string;
  description: string;
  severity: "High" | "Medium" | "Low";
  count: number;
  exampleFile: string;
  exampleLine: string;
}

export interface RepoScan {
  repo: string;
  fullName: string;
  stars: number;
  language: string | null;
  description: string | null;
  sdksFound: string[];
  antipatterns: Antipattern[];
  filesScanned: number;
  aiFilesFound: number;
  resilienceScore: number;
}

export interface ScanResult {
  name: string;
  slug: string;
  repos: RepoScan[];
  totalStars: number;
  totalAIFiles: number;
  sdksUsed: string[];
  totalHighSeverity: number;
  totalMediumSeverity: number;
  totalLowSeverity: number;
  overallScore: number;
  estimatedFailureRate: string;
  estimatedCostPerMonth: string;
  scannedAt: string;
}

// ── Get GitHub token ───────────────────────────────────────────────────────

function getGitHubToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("No GITHUB_TOKEN set and gh CLI not authenticated");
  }
}

// ── Scan a single repo ────────────────────────────────────────────────────

async function scanRepo(
  octokit: Octokit,
  owner: string,
  name: string,
  repoMeta: { fullName: string; stars: number; language: string | null; description: string | null },
): Promise<RepoScan> {
  const sdksFound = new Set<string>();
  const antipatterns: Antipattern[] = [];
  let filesScanned = 0;
  let aiFilesFound = 0;

  const searchQueries = ["openai", "anthropic", "langchain", "crewai", "autogen", "llama_index", "ChatCompletion", "generateText"];
  const filesChecked = new Set<string>();

  for (const query of searchQueries) {
    try {
      const { data } = await octokit.search.code({ q: `${query} repo:${owner}/${name}`, per_page: 10 });

      for (const item of data.items) {
        if (filesChecked.has(item.path)) continue;
        filesChecked.add(item.path);

        if (item.path.includes("node_modules/") || item.path.includes("vendor/") ||
            item.path.includes(".lock") || item.path.includes("package-lock") ||
            item.path.includes("dist/") || item.path.includes("build/") ||
            item.path.includes("__pycache__/") || item.path.includes(".min.") ||
            item.path.endsWith(".md") || item.path.endsWith(".txt") ||
            item.path.endsWith(".json") || item.path.endsWith(".yaml") ||
            item.path.endsWith(".yml") || item.path.endsWith(".toml") ||
            item.path.includes("test_") || item.path.includes("_test.") ||
            item.path.includes(".test.") || item.path.includes("__tests__/")) continue;

        try {
          const { data: fileData } = await octokit.repos.getContent({ owner, repo: name, path: item.path });
          if (!("content" in fileData) || !fileData.content) continue;

          const content = Buffer.from(fileData.content, "base64").toString("utf-8");
          filesScanned++;

          let hasAI = false;
          for (const sdk of AI_SDK_PATTERNS) {
            for (const pattern of sdk.patterns) {
              if (pattern.test(content)) { sdksFound.add(sdk.name); hasAI = true; break; }
            }
          }
          if (hasAI) aiFilesFound++;

          const hasRetryLib = /(?:tenacity|backoff|retry|Retry|@retry|with_retries|exponential_backoff|retrying)/i.test(content);
          const hasCircuitBreaker = /(?:circuit.?breaker|CircuitBreaker|pybreaker)/i.test(content);
          const hasResilience = hasRetryLib || hasCircuitBreaker;

          if (!hasAI) continue;

          for (const ap of ERROR_ANTIPATTERNS) {
            if (hasResilience && (ap.name.includes("Unprotected") || ap.name.includes("No timeout"))) continue;

            let totalCount = 0;
            let exampleLine = "";
            for (const pattern of ap.patterns) {
              const freshPattern = new RegExp(pattern.source, pattern.flags);
              const matches = content.match(freshPattern);
              if (matches && matches.length > 0) {
                totalCount += matches.length;
                if (!exampleLine) {
                  const lines = content.split("\n");
                  for (const line of lines) {
                    const linePattern = new RegExp(pattern.source, pattern.flags.replace("g", ""));
                    if (linePattern.test(line)) { exampleLine = line.trim().slice(0, 120); break; }
                  }
                }
              }
            }
            if (totalCount > 0) {
              const existing = antipatterns.find((a) => a.name === ap.name);
              if (existing) { existing.count += totalCount; }
              else { antipatterns.push({ name: ap.name, description: ap.description, severity: ap.severity, count: totalCount, exampleFile: item.path, exampleLine }); }
            }
          }
        } catch { /* file fetch failed */ }
      }
      await new Promise((r) => setTimeout(r, 2000));
    } catch { /* search failed for this query */ }
  }

  const highCount = antipatterns.filter((a) => a.severity === "High").reduce((s, a) => s + a.count, 0);
  const medCount = antipatterns.filter((a) => a.severity === "Medium").reduce((s, a) => s + a.count, 0);
  const lowCount = antipatterns.filter((a) => a.severity === "Low").reduce((s, a) => s + a.count, 0);
  const highPenalty = highCount > 0 ? 15 + Math.min(30, Math.log2(highCount) * 10) : 0;
  const medPenalty = medCount > 0 ? 8 + Math.min(20, Math.log2(medCount) * 6) : 0;
  const lowPenalty = lowCount > 0 ? Math.min(10, Math.log2(lowCount) * 3) : 0;
  const resilienceScore = Math.max(0, Math.min(100, Math.round(100 - highPenalty - medPenalty - lowPenalty)));

  return { repo: name, fullName: repoMeta.fullName, stars: repoMeta.stars, language: repoMeta.language, description: repoMeta.description, sdksFound: [...sdksFound], antipatterns, filesScanned, aiFilesFound, resilienceScore };
}

// ── Public scan function ───────────────────────────────────────────────────

export async function runScan(repoFullName: string): Promise<ScanResult> {
  const token = getGitHubToken();
  const octokit = new Octokit({ auth: token });

  const [owner, name] = repoFullName.split("/");
  if (!owner || !name) throw new Error("Invalid repo format. Use owner/repo");

  const { data: r } = await octokit.repos.get({ owner, repo: name });

  const scan = await scanRepo(octokit, r.owner.login, r.name, {
    fullName: r.full_name,
    stars: r.stargazers_count ?? 0,
    language: r.language,
    description: r.description,
  });

  if (scan.sdksFound.length === 0 && scan.aiFilesFound === 0) {
    throw new Error("No AI agent code found in this repo.");
  }

  const totalHigh = scan.antipatterns.filter((a) => a.severity === "High").reduce((c, a) => c + a.count, 0);
  const totalMedium = scan.antipatterns.filter((a) => a.severity === "Medium").reduce((c, a) => c + a.count, 0);
  const totalLow = scan.antipatterns.filter((a) => a.severity === "Low").reduce((c, a) => c + a.count, 0);

  const failureRate = totalHigh > 10 ? "5-12%" : totalHigh > 5 ? "3-8%" : totalHigh > 0 ? "1-5%" : "<1%";
  const costPerMonth = totalHigh > 10 ? "$500-$2,000" : totalHigh > 5 ? "$200-$800" : totalHigh > 0 ? "$50-$300" : "<$50";
  const slug = repoFullName.replace(/\//g, "-").replace(/[^a-zA-Z0-9.-]/g, "_");

  return {
    name: r.full_name,
    slug,
    repos: [scan],
    totalStars: scan.stars,
    totalAIFiles: scan.aiFilesFound,
    sdksUsed: scan.sdksFound,
    totalHighSeverity: totalHigh,
    totalMediumSeverity: totalMedium,
    totalLowSeverity: totalLow,
    overallScore: scan.resilienceScore,
    estimatedFailureRate: failureRate,
    estimatedCostPerMonth: costPerMonth,
    scannedAt: new Date().toISOString(),
  };
}
