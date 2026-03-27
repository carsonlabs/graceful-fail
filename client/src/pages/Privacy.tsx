import { Link } from "wouter";
import { Zap, ArrowLeft } from "lucide-react";

const SECTIONS = [
  {
    id: "overview",
    title: "1. Overview",
    content: `This Privacy Policy explains how Freedom Engineers ("we," "us," or "our") collects, uses, stores, and shares information when you use SelfHeal ("the Service"). We are committed to being transparent about our data practices and to handling your data with care.

The short version: We collect the minimum data necessary to operate the Service. We do not sell your data. We do not store your API request bodies or third-party API credentials. You can export or delete your data at any time.`,
  },
  {
    id: "collect",
    title: "2. Information We Collect",
    content: `2.1 Account Information
When you create an account via Manus OAuth, we receive and store your name and email address, your account creation timestamp, and your subscription tier and billing status.

2.2 API Key Data
We store hashed (SHA-256) representations of your API keys for authentication purposes. We never store your raw API keys in our database. The hash is one-way and cannot be reversed to recover the original key.

2.3 Request Log Metadata
For each request proxied through the Service, we log: destination URL, HTTP method, HTTP status code, response time, error analysis output, detected provider, and error category. Request bodies, response bodies, and Authorization headers are NOT stored — they are processed transiently in memory and discarded after analysis.

2.4 Usage Statistics
We aggregate request counts, credit consumption, and error rates per user per day to power the usage analytics dashboard.

2.5 Billing Information
Payment processing is handled entirely by Stripe. We store only your Stripe Customer ID and Subscription ID. We never see or store your full credit card number, CVV, or billing address.

2.6 Slack Integration Data
If you configure a Slack webhook, we store the webhook URL and optional channel name. This URL is used solely to deliver error alerts you have requested.

2.7 Cookies and Session Data
We use a single session cookie (HTTP-only, Secure, SameSite=Strict) to maintain your authenticated session. We do not use third-party tracking cookies or advertising cookies.`,
  },
  {
    id: "use",
    title: "3. How We Use Your Information",
    content: `We use the information we collect to:

• Authenticate your API requests and enforce rate limits
• Generate LLM-powered error analysis for intercepted requests
• Display request logs, usage analytics, and billing history in your dashboard
• Send Slack alerts and weekly digest emails you have opted into
• Process billing and manage your subscription via Stripe
• Respond to your support requests
• Detect and prevent abuse, fraud, or violations of our Terms of Service
• Improve the Service through aggregate, anonymized usage analysis

We do not use your data to train LLM models. We do not sell, rent, or share your personal data with third parties for their marketing purposes.`,
  },
  {
    id: "leaderboard",
    title: "4. Public API Leaderboard",
    content: `The public status page at gracefulfail.dev/status displays a "Most Failed APIs" leaderboard. This data is aggregated across all users, anonymized to domain name only (e.g., api.openai.com) with no paths, query parameters, or user identifiers included, refreshed every 24 hours, and not linkable to any individual account or request.`,
  },
  {
    id: "sharing",
    title: "5. Data Sharing and Third Parties",
    content: `We share data with the following third parties only as necessary to provide the Service:

• Stripe — Payment processing (email, Stripe Customer ID)
• LLM Provider (Manus Built-in API) — Error analysis (sanitized request metadata, no credentials)
• Manus OAuth — Authentication (name, email via OAuth flow)
• Slack — Error alerts if configured (error details you've opted to receive)

We do not share your data with analytics platforms, advertising networks, or data brokers.`,
  },
  {
    id: "retention",
    title: "6. Data Retention",
    content: `Request log metadata: 7 days (Hobby), 30 days (Pro), 90 days (Agency)
Account information: Until account deletion
Billing records: 7 years (legal/tax compliance)
Usage statistics (aggregate): 12 months
Session cookies: Browser session or 30 days (remember me)

You may request deletion of your account and associated data at any time by emailing hello@gracefulfail.dev. We will process deletion requests within 30 days, except for billing records required by law.`,
  },
  {
    id: "security",
    title: "7. Security",
    content: `We implement the following security measures:

• All data in transit is encrypted via TLS 1.2+
• API keys are stored as one-way SHA-256 hashes
• Authorization headers are stripped before LLM processing
• Session cookies are HTTP-only, Secure, and SameSite=Strict
• Database access is restricted to application servers via private networking
• Stripe handles all payment card data under PCI DSS compliance

No system is perfectly secure. If you discover a security vulnerability, please disclose it responsibly to hello@gracefulfail.dev.`,
  },
  {
    id: "rights",
    title: "8. Your Rights",
    content: `Depending on your jurisdiction, you may have the following rights regarding your personal data:

• Access: Request a copy of the data we hold about you
• Correction: Request correction of inaccurate data
• Deletion: Request deletion of your account and associated data
• Portability: Export your request logs as CSV from the dashboard at any time
• Opt-out: Unsubscribe from weekly digest emails at any time from dashboard settings

To exercise any of these rights, contact us at hello@gracefulfail.dev. We will respond within 30 days.

GDPR (EU/EEA users): If you are located in the European Economic Area, you have additional rights under the General Data Protection Regulation. Our legal basis for processing your data is (a) contract performance for account and billing data, and (b) legitimate interests for security and abuse prevention. You may lodge a complaint with your local data protection authority.

CCPA (California users): We do not sell personal information as defined under the California Consumer Privacy Act.`,
  },
  {
    id: "children",
    title: "9. Children's Privacy",
    content: `The Service is not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will delete it promptly.`,
  },
  {
    id: "changes",
    title: "10. Changes to This Policy",
    content: `We will notify you of material changes to this Privacy Policy by email or by posting a notice in the dashboard at least 14 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the revised policy.`,
  },
  {
    id: "contact",
    title: "11. Contact",
    content: `For privacy-related questions or requests:\n\nFreedom Engineers\nhello@gracefulfail.dev\ngracefulfail.dev`,
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-tight">SelfHeal</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </nav>
        </div>
      </header>

      <main className="container py-16 max-w-3xl">
        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">
            Effective Date: March 27, 2026 &nbsp;·&nbsp; Last Updated: March 27, 2026
          </p>
        </div>

        {/* Summary callout */}
        <div className="mb-10 p-5 rounded-xl border border-primary/20 bg-primary/5">
          <p className="text-sm font-medium text-foreground mb-1">The short version</p>
          <p className="text-sm text-muted-foreground">
            We collect the minimum data necessary to operate the Service. We do not sell your data. We do not store your API request bodies or third-party API credentials. You can export or delete your data at any time.
          </p>
        </div>

        {/* Table of Contents */}
        <nav className="mb-12 p-5 rounded-xl border border-border bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contents</p>
          <ol className="space-y-1.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div className="space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id}>
              <h2 className="text-lg font-semibold text-foreground mb-3">{s.title}</h2>
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {s.content}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            SelfHeal is a product of Freedom Engineers ·{" "}
            <a href="mailto:hello@gracefulfail.dev" className="hover:text-foreground transition-colors">
              hello@gracefulfail.dev
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
