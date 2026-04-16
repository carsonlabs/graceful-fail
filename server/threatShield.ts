/**
 * ThreatShield — Security intelligence layer for SelfHeal proxy.
 *
 * Checks origin IPs and destination URLs against free threat databases
 * before proxying. All APIs have generous free tiers:
 *
 * - AbuseIPDB:        1,000 checks/day  (API key required)
 * - URLhaus:          Unlimited, no key  (abuse.ch)
 * - Google Safe Browsing: 10K lookups/day (API key required)
 * - IPGeolocation.io: 30,000/month       (API key required)
 *
 * Configure via environment variables. Missing keys = that check is skipped.
 * The proxy still works without any threat APIs configured.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ThreatCheckResult {
  allowed: boolean;
  threats: ThreatSignal[];
  checked_at: string;
  duration_ms: number;
}

export interface ThreatSignal {
  source: "abuseipdb" | "urlhaus" | "safebrowsing" | "ipgeo";
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  details?: Record<string, unknown>;
}

// ── Config ─────────────────────────────────────────────────────────────────

const ABUSEIPDB_KEY = process.env.ABUSEIPDB_API_KEY ?? "";
const SAFEBROWSING_KEY = process.env.GOOGLE_SAFEBROWSING_API_KEY ?? "";
const IPGEO_KEY = process.env.IPGEOLOCATION_API_KEY ?? "";

// Block threshold: AbuseIPDB confidence score 0-100.
// IPs above this score are blocked.
const ABUSEIPDB_BLOCK_THRESHOLD = 50;

// ── In-memory cache (TTL-based) ────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

// Periodic cache cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expires) cache.delete(key);
  }
}, 60_000);

// ── Individual Checks ──────────────────────────────────────────────────────

/** Check IP against AbuseIPDB — free: 1,000/day */
async function checkAbuseIPDB(ip: string): Promise<ThreatSignal | null> {
  if (!ABUSEIPDB_KEY || !ip) return null;

  const cacheKey = `abuseipdb:${ip}`;
  const cached = getCached<ThreatSignal | false>(cacheKey);
  if (cached !== null) return cached || null;

  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      {
        headers: {
          Key: ABUSEIPDB_KEY,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(3000),
      }
    );

    if (!res.ok) {
      setCache(cacheKey, false);
      return null;
    }

    const json = (await res.json()) as {
      data: {
        abuseConfidenceScore: number;
        totalReports: number;
        countryCode: string;
        isp: string;
      };
    };

    const score = json.data.abuseConfidenceScore;
    const reports = json.data.totalReports;

    if (score >= ABUSEIPDB_BLOCK_THRESHOLD) {
      const signal: ThreatSignal = {
        source: "abuseipdb",
        severity: score >= 80 ? "critical" : "high",
        reason: `IP ${ip} has abuse confidence score ${score}/100 with ${reports} reports`,
        details: {
          score,
          reports,
          country: json.data.countryCode,
          isp: json.data.isp,
        },
      };
      setCache(cacheKey, signal);
      return signal;
    }

    setCache(cacheKey, false);
    return null;
  } catch {
    return null; // Timeout or network error — don't block the request
  }
}

/** Check URL against URLhaus (abuse.ch) — free, unlimited, no key */
async function checkURLhaus(url: string): Promise<ThreatSignal | null> {
  const cacheKey = `urlhaus:${url}`;
  const cached = getCached<ThreatSignal | false>(cacheKey);
  if (cached !== null) return cached || null;

  try {
    const res = await fetch("https://urlhaus-api.abuse.ch/v1/url/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `url=${encodeURIComponent(url)}`,
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      setCache(cacheKey, false);
      return null;
    }

    const json = (await res.json()) as {
      query_status: string;
      url_status?: string;
      threat?: string;
      tags?: string[];
    };

    if (json.query_status === "ok" && json.url_status === "online") {
      const signal: ThreatSignal = {
        source: "urlhaus",
        severity: "critical",
        reason: `URL flagged as malware distribution: ${json.threat || "unknown threat"}`,
        details: {
          status: json.url_status,
          threat: json.threat,
          tags: json.tags,
        },
      };
      setCache(cacheKey, signal);
      return signal;
    }

    setCache(cacheKey, false);
    return null;
  } catch {
    return null;
  }
}

/** Check URL against Google Safe Browsing — free: 10K/day */
async function checkSafeBrowsing(url: string): Promise<ThreatSignal | null> {
  if (!SAFEBROWSING_KEY) return null;

  const cacheKey = `safebrowsing:${url}`;
  const cached = getCached<ThreatSignal | false>(cacheKey);
  if (cached !== null) return cached || null;

  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFEBROWSING_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "selfheal-proxy", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
        signal: AbortSignal.timeout(3000),
      }
    );

    if (!res.ok) {
      setCache(cacheKey, false);
      return null;
    }

    const json = (await res.json()) as {
      matches?: Array<{
        threatType: string;
        platformType: string;
      }>;
    };

    if (json.matches && json.matches.length > 0) {
      const signal: ThreatSignal = {
        source: "safebrowsing",
        severity: "critical",
        reason: `Google Safe Browsing: ${json.matches.map((m) => m.threatType).join(", ")}`,
        details: { matches: json.matches },
      };
      setCache(cacheKey, signal);
      return signal;
    }

    setCache(cacheKey, false);
    return null;
  } catch {
    return null;
  }
}

/** Check IP geolocation + proxy detection — free: 30K/month */
async function checkIPGeolocation(ip: string): Promise<ThreatSignal | null> {
  if (!IPGEO_KEY || !ip) return null;

  const cacheKey = `ipgeo:${ip}`;
  const cached = getCached<ThreatSignal | false>(cacheKey);
  if (cached !== null) return cached || null;

  try {
    const res = await fetch(
      `https://api.ipgeolocation.io/ipgeo?apiKey=${IPGEO_KEY}&ip=${encodeURIComponent(ip)}&fields=is_proxy,proxy_type,isp,organization`,
      { signal: AbortSignal.timeout(3000) }
    );

    if (!res.ok) {
      setCache(cacheKey, false);
      return null;
    }

    const json = (await res.json()) as {
      is_proxy?: boolean;
      proxy_type?: string;
      isp?: string;
      organization?: string;
    };

    // Flag known proxy types (TOR, VPN from data centers) as medium severity
    if (json.is_proxy && json.proxy_type === "TOR") {
      const signal: ThreatSignal = {
        source: "ipgeo",
        severity: "medium",
        reason: `Request originates from TOR exit node`,
        details: {
          proxy_type: json.proxy_type,
          isp: json.isp,
          organization: json.organization,
        },
      };
      setCache(cacheKey, signal);
      return signal;
    }

    setCache(cacheKey, false);
    return null;
  } catch {
    return null;
  }
}

// ── Main Check ─────────────────────────────────────────────────────────────

/**
 * Run all configured threat checks in parallel.
 * Returns immediately if no threat APIs are configured.
 *
 * Policy:
 * - "critical" severity from any source → block the request
 * - "high" severity → block
 * - "medium" severity → allow but flag in response headers
 * - "low" severity → allow silently
 */
export async function checkThreats(
  clientIp: string | undefined,
  destinationUrl: string
): Promise<ThreatCheckResult> {
  const start = Date.now();
  const ip = clientIp || "";

  // Run all checks in parallel (each has its own 3s timeout)
  const results = await Promise.allSettled([
    checkAbuseIPDB(ip),
    checkURLhaus(destinationUrl),
    checkSafeBrowsing(destinationUrl),
    checkIPGeolocation(ip),
  ]);

  const threats: ThreatSignal[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      threats.push(result.value);
    }
  }

  // Block on critical or high severity
  const blocked = threats.some(
    (t) => t.severity === "critical" || t.severity === "high"
  );

  return {
    allowed: !blocked,
    threats,
    checked_at: new Date().toISOString(),
    duration_ms: Date.now() - start,
  };
}

/**
 * Quick check: are any threat APIs configured at all?
 * If not, skip the threat check entirely (zero latency cost).
 */
export function isThreatShieldEnabled(): boolean {
  return !!(ABUSEIPDB_KEY || SAFEBROWSING_KEY || IPGEO_KEY);
  // URLhaus doesn't need a key, but we only enable it
  // when at least one other threat API is configured
}
