/**
 * x402 End-to-End Test Script
 *
 * Tests the full paid heal flow on selfheal.dev:
 *   1. Send a request that will fail (OpenAI with no key)
 *   2. Receive 402 with x402 payment spec
 *   3. Sign a USDC payment using a private key
 *   4. Retry with X-PAYMENT header
 *   5. Receive healed response with fix instructions
 *
 * Prerequisites:
 *   - A wallet with testnet USDC on Base Sepolia
 *   - Set WALLET_PRIVATE_KEY env var (or use .env file)
 *
 * Usage:
 *   WALLET_PRIVATE_KEY=0x... node scripts/test-x402-heal.mjs
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";

const SELFHEAL_URL = "https://selfheal.dev";

// ── Config ───────────────────────────────────────────────────────────────────

const privateKey = process.env.WALLET_PRIVATE_KEY;
if (!privateKey) {
  console.error("ERROR: Set WALLET_PRIVATE_KEY env var");
  console.error("  WALLET_PRIVATE_KEY=0x... node scripts/test-x402-heal.mjs");
  process.exit(1);
}

// ── Setup wallet + x402 client ───────────────────────────────────────────────

console.log("\n=== SelfHeal x402 End-to-End Test ===\n");

const account = privateKeyToAccount(privateKey);
console.log("Wallet:", account.address);

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

const signer = toClientEvmSigner(walletClient);
const exactScheme = new ExactEvmScheme(signer);

const client = new x402Client();
client.register("eip155:84532", exactScheme); // Base Sepolia
client.registerV1("eip155:84532", exactScheme); // v1 compat

const httpClient = new x402HTTPClient(client);

// ── Test 1: Free pass-through ────────────────────────────────────────────────

console.log("--- Test 1: Free pass-through (should be $0) ---");

const passResp = await fetch(`${SELFHEAL_URL}/api/x402/proxy`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: "https://httpbin.org/get",
    method: "GET",
  }),
});

console.log("Status:", passResp.status);
console.log("Cost:", passResp.headers.get("x-selfheal-cost") ?? "0");
console.log("Result: FREE pass-through ✓\n");

// ── Test 2: Trigger 402 → Pay → Heal ────────────────────────────────────────

console.log("--- Test 2: Paid heal flow (OpenAI without key) ---");

// Step 1: Send request that will fail
const failResp = await fetch(`${SELFHEAL_URL}/api/x402/proxy`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: "https://api.openai.com/v1/chat/completions",
    method: "POST",
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
    }),
  }),
});

console.log("Step 1 - Status:", failResp.status);

if (failResp.status !== 402) {
  console.error("Expected 402, got", failResp.status);
  console.error(await failResp.text());
  process.exit(1);
}

// Step 2: Parse x402 payment spec
const paymentRequired = await failResp.json();
console.log("Step 2 - x402 version:", paymentRequired.x402Version);
console.log("Step 2 - Tier:", paymentRequired.accepts?.[0]?.description);
console.log("Step 2 - Price:", paymentRequired.accepts?.[0]?.maxAmountRequired, "atomic USDC");
console.log("Step 2 - Pay to:", paymentRequired.accepts?.[0]?.payTo);

// Step 3: Create payment payload using x402 client
console.log("Step 3 - Signing payment...");

let paymentPayload;
try {
  paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  console.log("Step 3 - Payment signed ✓");
} catch (err) {
  console.error("Step 3 - Payment signing failed:", err.message);
  console.error("\nMake sure your wallet has testnet USDC on Base Sepolia.");
  console.error("Get some at: https://faucet.circle.com/");
  process.exit(1);
}

// Step 4: Get the payment header
const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
console.log("Step 4 - Payment header keys:", Object.keys(paymentHeaders));

// Step 5: Retry with payment proof
console.log("Step 5 - Retrying with payment proof...");

const healResp = await fetch(`${SELFHEAL_URL}/api/x402/proxy`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...paymentHeaders,
  },
  body: JSON.stringify({
    url: "https://api.openai.com/v1/chat/completions",
    method: "POST",
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
    }),
  }),
});

console.log("Step 5 - Heal status:", healResp.status);

const healData = await healResp.json();

if (healData.healed) {
  console.log("\n=== HEAL SUCCEEDED ===");
  console.log("Settled:", healData.settled);
  console.log("TX Hash:", healData.txHash ?? "N/A");
  console.log("Tier:", healData.meta?.tier);
  console.log("Cost:", healData.meta?.cost_usdc, "USDC");
  console.log("Latency:", healData.meta?.latency_ms, "ms");
  console.log("\nError Analysis:");
  console.log("  Category:", healData.error_analysis?.error_category);
  console.log("  Explanation:", healData.error_analysis?.human_readable_explanation);
  console.log("  Fix:", healData.error_analysis?.actionable_fix_for_agent);
  console.log("  Retriable:", healData.error_analysis?.is_retriable);
} else {
  console.log("\nHeal response:", JSON.stringify(healData, null, 2));
}

// ── Test 3: Check usage stats ────────────────────────────────────────────────

console.log("\n--- Test 3: Usage stats ---");

const usageResp = await fetch(`${SELFHEAL_URL}/api/x402/usage`);
const usage = await usageResp.json();
console.log("Total requests:", usage.proxy?.totalRequests);
console.log("Successes:", usage.proxy?.successes);
console.log("Failures:", usage.proxy?.failures);
console.log("Heals:", usage.heal?.totalRequests);
console.log("x402 payments:", usage.x402?.totalPayments);

console.log("\n=== All tests complete ===\n");
