// ── Email System ────────────────────────────────────────────────────────────
// Automated lifecycle emails for SelfHeal.

export { sendEmail } from "./sender";
export { welcomeEmail, inactivityNudgeEmail, usageAlertEmail } from "./templates";
export { triggerWelcomeEmail, triggerInactivityNudge, triggerUsageAlert } from "./triggers";
