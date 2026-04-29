import PDFDocument from "pdfkit";
import type { DeletionProof } from "./types.js";

export interface PdfBrandingOptions {
  productName?: string;
  productTagline?: string;
  contactEmail?: string;
}

const DEFAULT_BRANDING: Required<PdfBrandingOptions> = {
  productName: "selfheal compliance",
  productTagline: "Right-to-erasure infrastructure for AI agent stacks",
  contactEmail: "compliance@selfheal.dev",
};

/**
 * Build a one-page-ish signed PDF deletion receipt suitable for handing to
 * GDPR / CCPA auditors. The PDF embeds:
 *   - the user identifier and outcome
 *   - per-adapter results
 *   - the audit chain root hash
 *   - the base64 HMAC-SHA256 signed receipt envelope (verbatim)
 *
 * The crypto trust anchor is the signed receipt + root hash, NOT the PDF
 * itself — the PDF is human-readable packaging. To verify, an auditor pastes
 * the receipt into ComplianceClient.verifyProof() (or any HMAC-SHA256
 * verifier holding the tenant's audit secret).
 */
export function buildDeletionProofPdf(
  proof: DeletionProof,
  branding: PdfBrandingOptions = {},
): Promise<Buffer> {
  const b = { ...DEFAULT_BRANDING, ...branding };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "LETTER", compress: false, info: {
      Title: `Deletion Receipt — ${proof.userId}`,
      Author: b.productName,
      Subject: "GDPR/CCPA right-to-erasure deletion receipt",
      Keywords: "GDPR, CCPA, deletion, erasure, compliance, audit",
    } });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header band
    doc.fontSize(18).fillColor("#0a0a0a").text(b.productName.toUpperCase(), { continued: false });
    doc.fontSize(9).fillColor("#525252").text(b.productTagline);
    doc.moveDown(0.4);
    doc.strokeColor("#10b981").lineWidth(1).moveTo(48, doc.y).lineTo(564, doc.y).stroke();
    doc.moveDown(0.6);

    // Title
    doc.fontSize(20).fillColor("#0a0a0a").text("Deletion Receipt");
    doc.fontSize(10).fillColor("#525252").text(
      "Cryptographically-signed proof that a right-to-erasure request was executed across the configured data stores.",
      { width: 516 },
    );
    doc.moveDown(0.6);

    // Summary box
    const statusColor = proof.status === "success" ? "#16a34a" : proof.status === "partial" ? "#d97706" : "#dc2626";
    doc.fontSize(10).fillColor("#525252").text("USER ID");
    doc.fontSize(13).fillColor("#0a0a0a").text(proof.userId);
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#525252").text("STATUS");
    doc.fontSize(13).fillColor(statusColor).text(proof.status.toUpperCase());
    doc.moveDown(0.3);

    const startedLabel = "STARTED";
    const completedLabel = "COMPLETED";
    doc.fontSize(10).fillColor("#525252").text(`${startedLabel}     ${completedLabel}`);
    doc.fontSize(11).fillColor("#0a0a0a").text(
      `${formatTs(proof.startedAt).padEnd(28)} ${formatTs(proof.completedAt)}`,
    );
    doc.moveDown(0.6);

    // Per-adapter results table
    doc.fontSize(12).fillColor("#0a0a0a").text("Adapter results");
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor("#525252");
    const colHeaderY = doc.y;
    doc.text("ADAPTER", 48, colHeaderY, { width: 200 });
    doc.text("STATUS", 250, colHeaderY, { width: 80 });
    doc.text("RECORDS", 330, colHeaderY, { width: 80 });
    doc.text("ATTEMPTS", 410, colHeaderY, { width: 80 });
    doc.moveDown(0.2);
    doc.strokeColor("#e5e7eb").lineWidth(0.5).moveTo(48, doc.y).lineTo(564, doc.y).stroke();
    doc.moveDown(0.2);

    for (const r of proof.adapterResults) {
      const rowY = doc.y;
      doc.fontSize(10).fillColor("#0a0a0a").text(r.adapter, 48, rowY, { width: 200 });
      doc.fillColor(r.status === "success" ? "#16a34a" : "#dc2626").text(r.status, 250, rowY, { width: 80 });
      doc.fillColor("#0a0a0a").text(
        r.recordsAffected < 0 ? "—" : String(r.recordsAffected),
        330,
        rowY,
        { width: 80 },
      );
      doc.text(String(r.attempts), 410, rowY, { width: 80 });
      if (r.error) {
        doc.moveDown(0.1);
        doc.fontSize(8).fillColor("#dc2626").text(`error: ${r.error}`, 64, doc.y, { width: 500 });
      }
      doc.moveDown(0.3);
    }
    doc.moveDown(0.4);

    // Audit chain anchor
    doc.fontSize(12).fillColor("#0a0a0a").text("Audit chain anchor");
    doc.fontSize(9).fillColor("#525252").text(
      `Each entry in the audit log is HMAC-SHA256 signed and references the previous entry's hash, forming a tamper-evident chain. The value below is the hash of the final entry; modifying any earlier entry breaks verification.`,
      { width: 516 },
    );
    doc.moveDown(0.2);
    doc.font("Courier").fontSize(9).fillColor("#0a0a0a").text(proof.rootHash, { width: 516 });
    doc.font("Helvetica").moveDown(0.4);

    // Signed receipt envelope
    doc.fontSize(12).fillColor("#0a0a0a").text("Signed receipt envelope");
    doc.fontSize(9).fillColor("#525252").text(
      `Base64-encoded JSON containing the signed payload and ${proof.signatureAlgorithm} signature. Verifier: paste this string into selfheal's verifyProof() or any HMAC-SHA256 verifier holding the tenant's audit secret.`,
      { width: 516 },
    );
    doc.moveDown(0.2);
    doc.font("Courier").fontSize(7).fillColor("#0a0a0a").text(proof.signedReceipt, {
      width: 516,
      lineGap: 1,
    });
    doc.font("Helvetica");
    doc.moveDown(0.6);

    // Footer
    doc.fontSize(8).fillColor("#525252").text(
      `Receipt generated ${new Date().toISOString()} • ${b.contactEmail}`,
      48,
      doc.page.height - 64,
      { width: 516, align: "center" },
    );

    doc.end();
  });
}

function formatTs(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}
