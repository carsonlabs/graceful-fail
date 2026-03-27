import { createHmac } from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { webhookEndpoints, webhookDeliveries } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";

export type WebhookEvent = "rate_limit" | "non_retriable_error" | "all";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Sign a payload with HMAC-SHA256 using the endpoint's secret */
function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Attempt a single HTTP delivery to a webhook endpoint */
async function attemptDelivery(
  url: string,
  secret: string,
  payload: string,
  deliveryId: number
): Promise<{ success: boolean; statusCode: number | null }> {
  try {
    const signature = signPayload(payload, secret);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GracefulFail-Signature": `sha256=${signature}`,
        "X-GracefulFail-Delivery": deliveryId.toString(),
      },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return { success: response.ok, statusCode: response.status };
  } catch {
    return { success: false, statusCode: null };
  }
}

/** Deliver a webhook event to all matching endpoints for a user, with retry */
export async function dispatchWebhook(
  userId: number,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Fetch all active endpoints for this user that match the event
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.userId, userId), eq(webhookEndpoints.isActive, true)));

  const matchingEndpoints = endpoints.filter((ep) => {
    try {
      const events: string[] = JSON.parse(ep.events);
      return events.includes("all") || events.includes(event);
    } catch {
      return false;
    }
  });

  if (matchingEndpoints.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const payloadStr = JSON.stringify(payload);

  for (const endpoint of matchingEndpoints) {
    // Create delivery record
    const [insertResult] = await db
      .insert(webhookDeliveries)
      .values({
        endpointId: endpoint.id,
        event,
        payload: payloadStr,
        attempts: 0,
        success: false,
      })
      .$returningId();

    const deliveryId = insertResult?.id;
    if (!deliveryId) continue;

    // Attempt delivery with up to 3 retries (exponential backoff: 0s, 5s, 25s)
    const delays = [0, 5000, 25000];
    let lastStatusCode: number | null = null;
    let succeeded = false;

    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]! > 0) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }

      const result = await attemptDelivery(
        endpoint.url,
        endpoint.secret,
        payloadStr,
        deliveryId
      );

      lastStatusCode = result.statusCode;
      succeeded = result.success;

      await db
        .update(webhookDeliveries)
        .set({
          attempts: attempt + 1,
          responseStatusCode: lastStatusCode,
          success: succeeded,
          lastAttemptAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, deliveryId));

      if (succeeded) break;
    }

    if (!succeeded) {
      console.warn(
        `[Webhook] Failed to deliver ${event} to endpoint ${endpoint.id} after 3 attempts (last status: ${lastStatusCode})`
      );
      // Notify the project owner so no critical agent failure goes unnoticed
      try {
        await notifyOwner({
          title: `⚠️ Webhook delivery failed: ${event}`,
          content:
            `All 3 delivery attempts exhausted for webhook endpoint:\n` +
            `URL: ${endpoint.url}\n` +
            `Event: ${event}\n` +
            `Last HTTP status: ${lastStatusCode ?? "no response (timeout/network error)"}\n` +
            `Delivery ID: ${deliveryId}\n` +
            `Time: ${new Date().toISOString()}\n\n` +
            `Check the Webhooks page in your SelfHeal dashboard for details and to re-test the endpoint.`,
        });
      } catch (notifyErr) {
        console.warn("[Webhook] Failed to send owner notification:", notifyErr);
      }
    }
  }
}
