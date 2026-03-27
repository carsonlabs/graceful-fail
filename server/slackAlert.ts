/**
 * Slack alert helper — sends rich Block Kit messages to a configured Slack webhook.
 * Called when a non-retriable error is intercepted by the proxy engine.
 */

export interface SlackAlertPayload {
  destinationUrl: string;
  method: string;
  statusCode: number;
  errorCategory: string;
  explanation: string;
  actionableFix: string;
  provider?: string;
  apiKeyName?: string;
  channel?: string | null;
}

function providerEmoji(provider?: string): string {
  const map: Record<string, string> = {
    openai: "🤖",
    anthropic: "🧠",
    google: "🔍",
    cohere: "🌊",
    mistral: "💨",
    huggingface: "🤗",
    azure_openai: "☁️",
    other: "🔌",
  };
  return map[provider ?? "other"] ?? "🔌";
}

function categoryColor(category: string): string {
  const map: Record<string, string> = {
    auth: "#E53E3E",
    rate_limit: "#DD6B20",
    validation: "#D69E2E",
    not_found: "#805AD5",
    server_error: "#E53E3E",
    unknown: "#718096",
  };
  return map[category] ?? "#718096";
}

export async function sendSlackAlert(webhookUrl: string, payload: SlackAlertPayload): Promise<boolean> {
  const emoji = providerEmoji(payload.provider);
  const color = categoryColor(payload.errorCategory);
  const providerLabel = payload.provider && payload.provider !== "other"
    ? payload.provider.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "External API";

  let hostname = payload.destinationUrl;
  try { hostname = new URL(payload.destinationUrl).hostname; } catch { /* keep raw */ }

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Non-Retriable API Error Intercepted`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Provider:*\n${providerLabel}` },
        { type: "mrkdwn", text: `*Status Code:*\n\`${payload.statusCode}\`` },
        { type: "mrkdwn", text: `*Method:*\n\`${payload.method}\`` },
        { type: "mrkdwn", text: `*Category:*\n${payload.errorCategory}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Destination:*\n\`${hostname}\``,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*What happened:*\n${payload.explanation}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*How to fix:*\n>${payload.actionableFix}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Intercepted by *Graceful Fail* ${payload.apiKeyName ? `· Key: ${payload.apiKeyName}` : ""} · <https://aiproxy-gwqcgefq.manus.space/dashboard/logs|View logs>`,
        },
      ],
    },
  ];

  const slackBody: Record<string, unknown> = { blocks };
  if (payload.channel) slackBody.channel = payload.channel;

  // Attach color via attachments for the sidebar accent (Slack doesn't support color in blocks directly)
  const attachmentBody = {
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };
  if (payload.channel) (attachmentBody as Record<string, unknown>).channel = payload.channel;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attachmentBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch (err) {
    console.error("[SlackAlert] Failed to send:", err);
    return false;
  }
}

/** Send a test message to verify the webhook URL works */
export async function sendSlackTestMessage(webhookUrl: string, channel?: string | null): Promise<{ ok: boolean; statusCode?: number }> {
  const body: Record<string, unknown> = {
    attachments: [
      {
        color: "#38A169",
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "✅ Graceful Fail — Slack Connected!", emoji: true },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Your Slack integration is working. You'll receive alerts here when non-retriable API errors are intercepted by the proxy.\n\n*What you'll see:* Error details, the affected API, and an actionable fix for your agent.",
            },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: "Sent from <https://aiproxy-gwqcgefq.manus.space/dashboard/integrations/slack|Graceful Fail Integrations>" }],
          },
        ],
      },
    ],
  };
  if (channel) body.channel = channel;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { ok: res.ok, statusCode: res.status };
  } catch (err) {
    console.error("[SlackAlert] Test failed:", err);
    return { ok: false };
  }
}
