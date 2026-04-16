/**
 * URL safety utilities — SSRF protection for every outbound fetch on behalf of
 * user-supplied URLs.
 *
 * Three layers:
 *   1. Scheme + hostname pattern check (sync, catches literals and common hosts)
 *   2. DNS resolution check (async, catches public domains pointing at private IPs)
 *   3. Manual redirect handling via `safeFetch` — every hop is re-validated
 *
 * Full DNS rebind protection requires pinning the resolved IP into the fetch
 * dispatcher (undici Agent with custom connect.lookup). Not included here.
 *
 * Keep this file dependency-free so it can be copied across apps.
 */

import { resolve as dnsResolve } from 'dns/promises';

// ── Private / reserved IP ranges ─────────────────────────────────────────────

export function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip === '0.0.0.0' || ip.startsWith('0.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  if (/^22[4-9]\./.test(ip) || /^2[3-5]\d\./.test(ip)) return true;

  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);

  return false;
}

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '0' || h === '00' || h === '0x0') return true;
  if (/^[\d.]+$/.test(h) || h.includes(':')) return isPrivateIp(h);
  return false;
}

// ── URL validators ───────────────────────────────────────────────────────────

export function validateFetchUrl(urlString: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  if (isPrivateHost(parsed.hostname)) return null;
  return parsed;
}

let dnsWarningLogged = false;

export async function validateFetchUrlWithDns(urlString: string): Promise<URL | null> {
  const parsed = validateFetchUrl(urlString);
  if (!parsed) return null;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) || parsed.hostname.includes(':')) {
    return parsed;
  }

  try {
    const addresses = await dnsResolve(parsed.hostname);
    if (addresses.length === 0) return null;
    for (const addr of addresses) {
      if (isPrivateIp(addr)) return null;
    }
  } catch {
    if (!dnsWarningLogged) {
      console.warn('[url-safety] DNS resolution unavailable, falling back to hostname check');
      dnsWarningLogged = true;
    }
  }
  return parsed;
}

// ── safeFetch: SSRF-aware fetch with manual redirect re-validation ───────────

export class SsrfError extends Error {
  constructor(public reason: string, public url?: string) {
    super(`SSRF blocked: ${reason}${url ? ` (${url})` : ''}`);
    this.name = 'SsrfError';
  }
}

export interface SafeFetchOptions extends RequestInit {
  maxRedirects?: number;
  timeoutMs?: number;
  skipDns?: boolean;
}

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { maxRedirects = 3, timeoutMs = 10_000, skipDns = false, ...init } = options;

  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validate = skipDns ? validateFetchUrl : validateFetchUrlWithDns;
    const parsed = await validate(currentUrl);
    if (!parsed) throw new SsrfError('URL rejected by SSRF guard', currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const isRedirect =
      res.status >= 300 && res.status < 400 && res.headers.get('location');
    if (!isRedirect) return res;

    if (hop >= maxRedirects) {
      throw new SsrfError(`exceeded maxRedirects (${maxRedirects})`, currentUrl);
    }
    currentUrl = new URL(res.headers.get('location')!, parsed).toString();
  }

  throw new SsrfError('redirect loop', currentUrl);
}
