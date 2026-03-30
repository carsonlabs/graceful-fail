#!/usr/bin/env npx tsx
/**
 * Gmail Draft Creator — reads batch-manifest.json and outputs
 * draft-ready JSON for each prospect with an email address.
 *
 * Usage:
 *   npx tsx scripts/gmail-drafts.ts                    # list drafts to create
 *   npx tsx scripts/gmail-drafts.ts --json             # output as JSON for automation
 *
 * This script does NOT send emails. It prepares the data so Claude
 * can create Gmail drafts via the Gmail MCP tool.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const manifestPath = resolve(import.meta.dirname ?? ".", "..", "outreach-output", "batch-manifest.json");

if (!existsSync(manifestPath)) {
  console.error("No batch-manifest.json found. Run the outreach pipeline with --batch first.");
  process.exit(1);
}

interface ManifestEntry {
  target: string;
  slug: string;
  name: string;
  email: string | null;
  outDir: string;
  pdfPath: string;
  emailDraftPath: string;
  subject: string;
  score: number;
  highSeverity: number;
  status: string;
}

interface Manifest {
  batchDate: string;
  totalTargets: number;
  succeeded: number;
  skipped: number;
  errored: number;
  entries: ManifestEntry[];
}

const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const jsonMode = process.argv.includes("--json");

// Extract plain text email body from markdown draft
function extractEmailBody(draftPath: string): string {
  if (!existsSync(draftPath)) return "";
  const content = readFileSync(draftPath, "utf-8");

  // Everything between the first "---" separator and "## Notes for Carson"
  const bodyMatch = content.match(/---\n\n([\s\S]*?)\n\n---\n\n## Notes/);
  if (!bodyMatch) return content;

  // Strip markdown bold markers for plain text email
  return bodyMatch[1]!
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

interface GmailDraft {
  to: string;
  subject: string;
  body: string;
  pdfPath: string;
  prospect: string;
  score: number;
}

const drafts: GmailDraft[] = [];

for (const entry of manifest.entries) {
  if (entry.status !== "success") continue;
  if (!entry.email) continue;

  const body = extractEmailBody(entry.emailDraftPath);
  if (!body) continue;

  // Add attachment reminder to the body
  const bodyWithReminder = body + `\n\n---\n⚠️ ATTACH: ${entry.pdfPath}`;

  drafts.push({
    to: entry.email,
    subject: entry.subject,
    body: bodyWithReminder,
    pdfPath: entry.pdfPath,
    prospect: entry.name,
    score: entry.score,
  });
}

if (jsonMode) {
  console.log(JSON.stringify(drafts, null, 2));
} else {
  if (drafts.length === 0) {
    console.log("\nNo drafts to create.");
    console.log("Either no entries have email addresses, or all entries failed/were skipped.");

    // Show entries without emails
    const noEmail = manifest.entries.filter((e) => e.status === "success" && !e.email);
    if (noEmail.length > 0) {
      console.log(`\n${noEmail.length} successful entries need email addresses:`);
      for (const entry of noEmail) {
        console.log(`   ${entry.name} (${entry.target}) — score: ${entry.score}/100`);
      }
      console.log("\nAdd emails to your CSV and re-run the batch, or tell Claude:");
      console.log('   "create a gmail draft for <prospect> to <email>"');
    }
  } else {
    console.log(`\n📧 ${drafts.length} Gmail draft(s) ready to create:\n`);
    for (const draft of drafts) {
      console.log(`   ${draft.prospect} → ${draft.to}`);
      console.log(`   Subject: ${draft.subject}`);
      console.log(`   Score: ${draft.score}/100`);
      console.log(`   PDF: ${draft.pdfPath}`);
      console.log();
    }
    console.log('Tell Claude: "create gmail drafts from the batch manifest"');
  }
}
