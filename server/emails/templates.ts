// ── Email Templates ─────────────────────────────────────────────────────────
// Clean, developer-friendly transactional emails for SelfHeal.
// Each function returns { subject, html, text } ready for the sender.

const BRAND = "SelfHeal";
const DOMAIN = "selfheal.dev";
const DASHBOARD_URL = `https://${DOMAIN}/dashboard`;
const DOCS_URL = `https://${DOMAIN}/docs`;
const PLAYGROUND_URL = `https://${DOMAIN}/playground`;

// ── Shared styles ───────────────────────────────────────────────────────────

function wrap(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding-bottom:24px;">
          <span style="color:#fff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">${BRAND}</span>
        </td></tr>
        <tr><td style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:32px;">
          ${body}
        </td></tr>
        <tr><td style="padding-top:24px;text-align:center;">
          <span style="color:#666;font-size:12px;">${BRAND} -- ${DOMAIN}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function h(text: string): string {
  return `<h2 style="color:#fff;font-size:20px;font-weight:600;margin:0 0 16px 0;letter-spacing:-0.3px;">${text}</h2>`;
}

function p(text: string): string {
  return `<p style="color:#ccc;font-size:14px;line-height:1.6;margin:0 0 16px 0;">${text}</p>`;
}

function code(text: string): string {
  return `<pre style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;padding:16px;overflow-x:auto;margin:0 0 16px 0;"><code style="color:#e0e0e0;font-size:13px;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;white-space:pre;">${text}</code></pre>`;
}

function link(url: string, label: string): string {
  return `<a href="${url}" style="color:#3b82f6;text-decoration:none;">${label}</a>`;
}

function button(url: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#3b82f6;border-radius:6px;padding:12px 24px;">
    <a href="${url}" style="color:#fff;text-decoration:none;font-size:14px;font-weight:500;">${label}</a>
  </td></tr></table>`;
}

// ── Template A: Welcome + Quickstart ────────────────────────────────────────

export function welcomeEmail(user: { name?: string | null }): {
  subject: string;
  html: string;
  text: string;
} {
  const name = user.name || "there";

  const subject = "Your SelfHeal API key is ready";

  const html = wrap(`
    ${h(`Hey ${name}, welcome to ${BRAND}`)}
    ${p("Your account is set up. Here's how to get your first proxied request running in 60 seconds.")}

    ${p("<strong style=\"color:#fff;\">1. Install the SDK</strong>")}
    ${code(`# Python\npip install graceful-fail\n\n# Node.js\nnpm install graceful-fail`)}

    ${p("<strong style=\"color:#fff;\">2. Make a proxied request</strong>")}
    ${code(`curl -X POST https://api.${DOMAIN}/v1/proxy \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://api.openai.com/v1/chat/completions",
    "method": "POST",
    "headers": { "Authorization": "Bearer sk-..." },
    "body": { "model": "gpt-4", "messages": [{"role": "user", "content": "hello"}] }
  }'`)}

    ${p(`SelfHeal sits between your agent and the API. When requests fail, it intercepts the error, analyzes it with an LLM, and tells your agent exactly what went wrong and whether to retry.`)}

    ${p("<strong style=\"color:#fff;\">Quick links</strong>")}
    ${p(`${link(PLAYGROUND_URL, "Playground")} -- test requests without writing code<br>
${link(DOCS_URL, "Docs")} -- full API reference<br>
${link(DASHBOARD_URL, "Dashboard")} -- usage, keys, and settings`)}

    ${p(`Free tier: 500 requests/month, no credit card required.`)}

    ${p(`-- The ${BRAND} team`)}
  `);

  const text = `Hey ${name}, welcome to ${BRAND}

Your account is set up. Here's how to get your first proxied request running in 60 seconds.

1. Install the SDK

  Python:  pip install graceful-fail
  Node.js: npm install graceful-fail

2. Make a proxied request

  curl -X POST https://api.${DOMAIN}/v1/proxy \\
    -H "Authorization: Bearer YOUR_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{"url":"https://api.openai.com/v1/chat/completions","method":"POST","headers":{"Authorization":"Bearer sk-..."},"body":{"model":"gpt-4","messages":[{"role":"user","content":"hello"}]}}'

SelfHeal sits between your agent and the API. When requests fail, it intercepts the error, analyzes it with an LLM, and tells your agent exactly what went wrong and whether to retry.

Quick links:
  Playground: ${PLAYGROUND_URL}
  Docs: ${DOCS_URL}
  Dashboard: ${DASHBOARD_URL}

Free tier: 500 requests/month, no credit card required.

-- The ${BRAND} team`;

  return { subject, html, text };
}

// ── Template B: Inactivity Nudge (48h) ─────────────────────────────────────

export function inactivityNudgeEmail(user: { name?: string | null }): {
  subject: string;
  html: string;
  text: string;
} {
  const name = user.name?.split(" ")[0] || "there";

  const subject = "Did you get stuck? Here's a 2-minute integration guide";

  // Intentionally plain — this should feel like a real person wrote it
  const html = wrap(`
    ${p(`Hey ${name},`)}
    ${p(`I noticed you created a SelfHeal API key a couple days ago but haven't sent any requests through it yet. Totally fine -- just wanted to check if you hit a snag.`)}
    ${p(`The fastest way to see it work is the ${link(PLAYGROUND_URL, "playground")} -- paste in any API endpoint and SelfHeal will proxy the request and show you the full analysis if it fails. No code needed, takes about 30 seconds.`)}
    ${p(`If you'd rather jump straight to code, the ${link(DOCS_URL, "quickstart guide")} has copy-paste examples for Python, Node, and curl.`)}
    ${p(`If something's broken or confusing, just reply to this email. I read every one.`)}
    ${p(`Carson`)}
  `);

  const text = `Hey ${name},

I noticed you created a SelfHeal API key a couple days ago but haven't sent any requests through it yet. Totally fine -- just wanted to check if you hit a snag.

The fastest way to see it work is the playground (${PLAYGROUND_URL}) -- paste in any API endpoint and SelfHeal will proxy the request and show you the full analysis if it fails. No code needed, takes about 30 seconds.

If you'd rather jump straight to code, the quickstart guide (${DOCS_URL}) has copy-paste examples for Python, Node, and curl.

If something's broken or confusing, just reply to this email. I read every one.

Carson`;

  return { subject, html, text };
}

// ── Template C: Usage Upgrade Prompt (80%) ──────────────────────────────────

export function usageAlertEmail(params: {
  name?: string | null;
  used: number;
  limit: number;
  tier: string;
  upgradeUrl: string;
}): {
  subject: string;
  html: string;
  text: string;
} {
  const { used, limit, tier, upgradeUrl } = params;
  const name = params.name || "there";
  const pct = Math.round((used / limit) * 100);

  const subject = `Your agent is clearly working hard -- ${used.toLocaleString()} of ${limit.toLocaleString()} requests used`;

  const html = wrap(`
    ${h(`${pct}% of your ${tier} plan used this month`)}
    ${p(`Hey ${name},`)}
    ${p(`Good sign -- your agent has made <strong style="color:#fff;">${used.toLocaleString()}</strong> requests out of your <strong style="color:#fff;">${limit.toLocaleString()}</strong> monthly limit on the <strong style="color:#fff;">${tier}</strong> plan.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
      <tr><td style="background:#2a2a2a;border-radius:4px;height:8px;">
        <div style="background:#3b82f6;border-radius:4px;height:8px;width:${Math.min(pct, 100)}%;"></div>
      </td></tr>
      <tr><td style="padding-top:8px;">
        <span style="color:#999;font-size:12px;">${used.toLocaleString()} / ${limit.toLocaleString()} requests</span>
      </td></tr>
    </table>

    ${p(`When you hit the limit, proxied requests will return a 429 status with a clear error message. Your agent will still get responses -- they'll just include the rate limit info instead of the proxied result.`)}
    ${p(`If your agent is humming along at this rate, upgrading keeps it uninterrupted.`)}
    ${button(upgradeUrl, "View upgrade options")}
    ${p(`No pressure. You can also check your detailed usage breakdown in the ${link(DASHBOARD_URL, "dashboard")}.`)}
    ${p(`-- The ${BRAND} team`)}
  `);

  const text = `${pct}% of your ${tier} plan used this month

Hey ${name},

Good sign -- your agent has made ${used.toLocaleString()} requests out of your ${limit.toLocaleString()} monthly limit on the ${tier} plan.

[${used.toLocaleString()} / ${limit.toLocaleString()} requests]

When you hit the limit, proxied requests will return a 429 status with a clear error message. Your agent will still get responses -- they'll just include the rate limit info instead of the proxied result.

If your agent is humming along at this rate, upgrading keeps it uninterrupted.

Upgrade: ${upgradeUrl}

No pressure. You can also check your detailed usage breakdown in the dashboard: ${DASHBOARD_URL}

-- The ${BRAND} team`;

  return { subject, html, text };
}
