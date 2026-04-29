import { describe, it, expect } from "vitest";
import { buildDeletionProofPdf } from "../src/pdf.js";
import type { DeletionProof } from "../src/types.js";

function decodeHex(hex: string): string {
  if (hex.length % 2 !== 0) return "";
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return out;
}

/**
 * Extracts visible text from a PDFKit-produced PDF (uncompressed). Handles:
 *   <hex> Tj          — single string show
 *   [<hex> kern <hex> ... ] TJ  — kerned string show (concatenate hexes,
 *                                 skipping numeric kern adjustments)
 */
function extractText(pdf: Buffer): string {
  const ascii = pdf.toString("latin1");
  const out: string[] = [];
  // TJ arrays
  const tjRe = /\[([^\]]+)\]\s*TJ/g;
  for (const m of ascii.matchAll(tjRe)) {
    const body = m[1];
    let chunk = "";
    for (const hm of body.matchAll(/<([0-9a-fA-F]+)>/g)) {
      chunk += decodeHex(hm[1]);
    }
    out.push(chunk);
  }
  // Standalone Tj
  const tjSingleRe = /<([0-9a-fA-F]+)>\s*Tj/g;
  for (const m of ascii.matchAll(tjSingleRe)) {
    out.push(decodeHex(m[1]));
  }
  return out.join("\n");
}

const SAMPLE: DeletionProof = {
  userId: "u_42",
  status: "success",
  startedAt: "2026-04-29T00:00:00.000Z",
  completedAt: "2026-04-29T00:00:01.234Z",
  rootHash: "a".repeat(64),
  signedReceipt: "ZXhhbXBsZS1iYXNlNjQtZW5jb2RlZC1lbnZlbG9wZQ==",
  signatureAlgorithm: "HMAC-SHA256",
  auditEntries: [],
  adapterResults: [
    {
      adapter: "postgres",
      status: "success",
      recordsAffected: 7,
      startedAt: "2026-04-29T00:00:00.100Z",
      finishedAt: "2026-04-29T00:00:00.500Z",
      attempts: 1,
    },
    {
      adapter: "pinecone",
      status: "success",
      recordsAffected: -1,
      startedAt: "2026-04-29T00:00:00.100Z",
      finishedAt: "2026-04-29T00:00:00.900Z",
      attempts: 2,
    },
  ],
};

describe("buildDeletionProofPdf", () => {
  it("produces a valid PDF buffer", async () => {
    const pdf = await buildDeletionProofPdf(SAMPLE);
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.subarray(pdf.length - 6, pdf.length - 1).toString("ascii")).toBe("%%EOF");
  });

  it("embeds the user id, root hash, and signed receipt as raw text", async () => {
    const pdf = await buildDeletionProofPdf(SAMPLE);
    const ascii = extractText(pdf);
    expect(ascii).toContain("u_42");
    expect(ascii).toContain(SAMPLE.rootHash);
    expect(ascii).toContain(SAMPLE.signedReceipt);
  });

  it("renders failed adapters with their error message", async () => {
    const failing: DeletionProof = {
      ...SAMPLE,
      status: "partial",
      adapterResults: [
        ...SAMPLE.adapterResults,
        {
          adapter: "weaviate",
          status: "failed",
          recordsAffected: 0,
          startedAt: "2026-04-29T00:00:00.100Z",
          finishedAt: "2026-04-29T00:00:00.300Z",
          attempts: 2,
          error: "ETIMEDOUT connecting to upstream",
        },
      ],
    };
    const pdf = await buildDeletionProofPdf(failing);
    const ascii = extractText(pdf);
    expect(ascii).toContain("PARTIAL");
    expect(ascii).toContain("weaviate");
    expect(ascii).toContain("ETIMEDOUT");
  });

  it("respects branding overrides", async () => {
    const pdf = await buildDeletionProofPdf(SAMPLE, {
      productName: "ACME COMPLIANCE",
      productTagline: "Custom tagline",
      contactEmail: "ops@acme.example",
    });
    const ascii = extractText(pdf);
    expect(ascii).toContain("ACME COMPLIANCE");
    expect(ascii).toContain("Custom tagline");
    expect(ascii).toContain("ops@acme.example");
  });
});
