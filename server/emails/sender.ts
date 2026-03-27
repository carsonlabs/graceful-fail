// ── Email Sender ────────────────────────────────────────────────────────────
// Sends transactional email via the Resend API.
// Gracefully skips if RESEND_API_KEY is not set (dev/test environments).

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "SelfHeal <hey@selfheal.dev>";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[Email] RESEND_API_KEY not set — skipping email to ${params.to}: "${params.subject}"`);
    return false;
  }

  if (!params.to) {
    console.warn("[Email] No recipient address provided — skipping");
    return false;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "no body");
      console.error(`[Email] Resend API error ${response.status}: ${body}`);
      return false;
    }

    console.log(`[Email] Sent "${params.subject}" to ${params.to}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return false;
  }
}
