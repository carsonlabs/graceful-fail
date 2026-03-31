#!/usr/bin/env node
/**
 * ⚡ SELFHEAL WAR ROOM ⚡
 * Real-time terminal dashboard for SelfHeal / graceful-fail stats.
 * Run: node warroom.js
 * Zero npm installs — Node.js built-ins only.
 */

import https from 'https';

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  white:   '\x1b[97m',
  bgDark:  '\x1b[48;5;234m',
};

// ─── Box drawing chars ────────────────────────────────────────────────────────
const BOX_W = 62; // inner width (between the ║ borders)

function line(content = '') {
  // content is already rendered with ANSI — we need visible-char width
  const visible = content.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = BOX_W - visible.length;
  return `║${content}${' '.repeat(Math.max(0, pad))}║`;
}

function divider(char = '═') {
  return `╠${'═'.repeat(BOX_W)}╣`;
}

function top() {
  return `╔${'═'.repeat(BOX_W)}╗`;
}

function bottom() {
  return `╚${'═'.repeat(BOX_W)}╝`;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'SelfHeal-WarRoom/1.0 (github.com/carsonlabs/selfheal)',
        'Accept': 'application/json',
      },
    };
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ ok: true, status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ ok: false, status: res.statusCode, data: null });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, status: 0, data: null }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, status: 0, data: null }); });
  });
}

function fetchHead(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': 'SelfHeal-WarRoom/1.0' },
    };
    const req = https.request(options, (res) => {
      res.resume(); // drain
      resolve({ status: res.statusCode });
    });
    req.on('error', () => resolve({ status: 0 }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0 }); });
    req.end();
  });
}

// ─── Status badge helpers ─────────────────────────────────────────────────────
function badge(text, color) {
  return `${color}${C.bold}${text}${C.reset}`;
}

function prBadge(state) {
  if (!state) return badge('unavailable', C.dim);
  const s = state.toLowerCase();
  if (s === 'open')   return badge('OPEN',   C.yellow);
  if (s === 'closed') return badge('CLOSED', C.red);
  if (s === 'merged') return badge('MERGED', C.green);
  return badge(state.toUpperCase(), C.dim);
}

// Pad a label with dots to fixed width, then append a colored badge
function row(label, value, totalWidth = 56) {
  const labelClean = label.replace(/\x1b\[[0-9;]*m/g, '');
  const valueClean = value.replace(/\x1b\[[0-9;]*m/g, '');
  const dots = totalWidth - labelClean.length - valueClean.length;
  return ` ${label}${C.dim}${'.'.repeat(Math.max(1, dots))}${C.reset}${value}`;
}

// ─── Data fetchers ────────────────────────────────────────────────────────────
async function getSiteStatus() {
  const res = await fetchHead('https://selfheal.dev');
  if (res.status >= 200 && res.status < 400) {
    return badge('LIVE', C.green);
  }
  return badge(`DOWN (${res.status || 'timeout'})`, C.red);
}

async function getPyPIStats() {
  const res = await fetchJSON('https://pypistats.org/api/packages/graceful-fail/recent');
  if (!res.ok || !res.data?.data) return null;
  const d = res.data.data;
  return {
    day:   d.last_day   ?? '—',
    week:  d.last_week  ?? '—',
    month: d.last_month ?? '—',
  };
}

async function getNpmStats() {
  const [weekRes, monthRes] = await Promise.all([
    fetchJSON('https://api.npmjs.org/downloads/range/last-week/graceful-fail'),
    fetchJSON('https://api.npmjs.org/downloads/point/last-month/graceful-fail'),
  ]);

  let weekTotal = '—';
  let dayTotal  = '—';
  let monthTotal = '—';

  if (weekRes.ok && weekRes.data?.downloads) {
    const dl = weekRes.data.downloads;
    weekTotal = dl.reduce((s, d) => s + d.downloads, 0);
    // last entry = most recent day
    dayTotal = dl.length > 0 ? dl[dl.length - 1].downloads : '—';
  }

  if (monthRes.ok && monthRes.data?.downloads !== undefined) {
    monthTotal = monthRes.data.downloads;
  }

  return { day: dayTotal, week: weekTotal, month: monthTotal };
}

async function getPRStatus(owner, repo, number) {
  const res = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`);
  if (!res.ok || !res.data) return null;
  // GitHub returns 404 for merged PRs in pulls endpoint; check issues endpoint state + merged_at
  return res.data.state ?? null;
}

// GitHub pulls endpoint 404s for merged PRs, so also try the issue endpoint
async function getPRState(owner, repo, number) {
  // Try pulls first
  const prRes = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`);
  if (prRes.ok && prRes.data?.state) {
    // Check merged_at to distinguish merged vs closed
    if (prRes.data.merged_at) return 'merged';
    return prRes.data.state;
  }
  // Fall back to issues endpoint (works for closed/merged too)
  const issueRes = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`);
  if (issueRes.ok && issueRes.data) {
    if (issueRes.data.pull_request?.merged_at) return 'merged';
    return issueRes.data.state ?? null;
  }
  return null;
}

// ─── Render ───────────────────────────────────────────────────────────────────
async function render() {
  process.stdout.write('\x1Bc'); // clear screen

  // Show a loading stub immediately
  console.log(top());
  console.log(line(`  ${C.bold}${C.cyan}         ⚡  SELFHEAL WAR ROOM — LOADING...  ⚡${C.reset}`));
  console.log(bottom());

  // Fetch everything in parallel
  const [
    siteStatus,
    pypi,
    npm,
    pr1State,
    pr2State,
    pr3State,
  ] = await Promise.all([
    getSiteStatus(),
    getPyPIStats(),
    getNpmStats(),
    getPRState('langchain-ai', 'langchain', 3345),
    getPRState('e2b-dev', 'awesome-ai-agents', 598),
    getPRState('kyrolabs', 'awesome-langchain', 257),
  ]);

  const now = new Date().toLocaleTimeString();

  // Format PyPI row
  const pypiLine = pypi
    ? `     ${C.white}Last day: ${C.cyan}${String(pypi.day).padEnd(5)}${C.reset} ${C.white}Last week: ${C.cyan}${String(pypi.week).padEnd(6)}${C.reset} ${C.white}Last month: ${C.cyan}${pypi.month}${C.reset}`
    : `     ${C.dim}unavailable${C.reset}`;

  const npmLine = npm
    ? `     ${C.white}Last day: ${C.cyan}${String(npm.day).padEnd(5)}${C.reset} ${C.white}Last week: ${C.cyan}${String(npm.week).padEnd(6)}${C.reset} ${C.white}Last month: ${C.cyan}${npm.month}${C.reset}`
    : `     ${C.dim}unavailable${C.reset}`;

  // Clear screen and draw final board
  process.stdout.write('\x1Bc');

  const output = [
    top(),
    line(`  ${C.bold}${C.cyan}      ⚡  SELFHEAL WAR ROOM — LIVE  ⚡${C.reset}`),
    line(`  ${C.dim}       powered by graceful-fail${C.reset}`),
    divider(),
    line(''),
    line(row(`  ${C.white}selfheal.dev${C.reset}`, siteStatus)),
    line(''),
    divider(),
    line(''),
    line(`  ${C.bold}${C.magenta}📦 PyPI Downloads${C.reset}  ${C.dim}(graceful-fail)${C.reset}`),
    line(pypiLine),
    line(''),
    line(`  ${C.bold}${C.magenta}📦 npm Downloads${C.reset}   ${C.dim}(graceful-fail)${C.reset}`),
    line(npmLine),
    line(''),
    divider(),
    line(''),
    line(`  ${C.bold}${C.yellow}🔗 GitHub PRs${C.reset}`),
    line(row(`     langchain-ai/langchain #3345`, prBadge(pr1State))),
    line(row(`     e2b-dev/awesome-ai-agents #598`, prBadge(pr2State))),
    line(row(`     kyrolabs/awesome-langchain #257`, prBadge(pr3State))),
    line(''),
    divider(),
    line(`  ${C.dim}⏱  Last updated: ${C.white}${now}${C.reset}`),
    line(`  ${C.dim}🔄 Refreshes every 60s — Ctrl+C to exit${C.reset}`),
    bottom(),
  ].join('\n');

  console.log(output);
}

// ─── Main loop ────────────────────────────────────────────────────────────────
async function main() {
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    process.stdout.write('\x1Bc');
    console.log('👋  War room closed. Stay self-healing.\n');
    process.exit(0);
  });

  // First render
  await render();

  // Refresh every 60 seconds
  setInterval(async () => {
    await render();
  }, 60_000);
}

main().catch((err) => {
  console.error('War room crashed:', err);
  process.exit(1);
});
