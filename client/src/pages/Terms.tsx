import { Link } from "wouter";
import { Zap, ArrowLeft } from "lucide-react";

const SECTIONS = [
  {
    id: "agreement",
    title: "1. Agreement to Terms",
    content: `By accessing or using SelfHeal ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service. These Terms apply to all visitors, users, and others who access or use the Service.

The Service is operated by Freedom Engineers ("we," "us," or "our"). If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.`,
  },
  {
    id: "description",
    title: "2. Description of Service",
    content: `SelfHeal is an API proxy service that intercepts failed HTTP requests made by AI agents and automated systems, performs LLM-powered error analysis on those failures, and returns structured diagnostic information and remediation suggestions. The Service includes the proxy endpoint, developer dashboard, API key management, request logging, webhook notifications, and related features.`,
  },
  {
    id: "accounts",
    title: "3. Accounts and API Keys",
    content: `3.1 Registration. You must create an account to use the Service. You agree to provide accurate, current, and complete information during registration and to update such information as necessary.

3.2 API Keys. Upon registration, you may generate API keys to authenticate requests to the proxy endpoint. You are solely responsible for maintaining the confidentiality of your API keys. You must notify us immediately at hello@gracefulfail.dev if you suspect unauthorized use of your account or API keys.

3.3 Account Security. You are responsible for all activity that occurs under your account, whether or not you authorized it. We are not liable for any loss or damage arising from your failure to maintain the security of your account credentials.`,
  },
  {
    id: "acceptable-use",
    title: "4. Acceptable Use",
    content: `You agree not to use the Service to:

• Proxy requests containing illegal content or requests that violate applicable law
• Circumvent rate limits, access controls, or security measures of third-party APIs in violation of those APIs' terms of service
• Transmit malware, viruses, or other malicious code through the proxy
• Attempt to reverse-engineer, decompile, or extract the source code of the Service
• Resell, sublicense, or white-label the Service without our prior written consent
• Use the Service in any way that could damage, disable, overburden, or impair our infrastructure
• Scrape, harvest, or collect data from the Service in bulk for purposes unrelated to your own agent workflows

We reserve the right to suspend or terminate accounts that violate these restrictions without prior notice.`,
  },
  {
    id: "data",
    title: "5. Data Handling and Privacy",
    content: `5.1 Request Logs. The Service logs metadata about proxied requests, including destination URL, HTTP method, status code, response time, and error analysis output. Request bodies and response bodies may be temporarily processed in memory to perform LLM analysis but are not stored in our database.

5.2 Sensitive Data. You must not send personally identifiable information (PII), payment card data, health records, or other sensitive regulated data through the proxy. The Service is designed for AI agent-to-API communication, not for processing end-user personal data.

5.3 Header Sanitization. The Service automatically strips Authorization headers, API keys, and credential-bearing headers before passing request context to the LLM analysis engine. However, you remain responsible for ensuring that sensitive data is not embedded in request bodies or URLs.

5.4 Data Retention. Request log metadata is retained for 7 days (Hobby), 30 days (Pro), or 90 days (Agency) depending on your plan. You may export or delete your logs at any time from the dashboard.

For full details, see our Privacy Policy.`,
  },
  {
    id: "billing",
    title: "6. Pricing, Billing, and Refunds",
    content: `6.1 Free Tier. The Hobby tier is provided free of charge, subject to a limit of 500 proxied requests per calendar month. We reserve the right to modify or discontinue the free tier with 30 days' notice.

6.2 Paid Plans. Pro ($29/month) and Agency ($99/month) plans are billed monthly in advance via Stripe. By subscribing, you authorize us to charge your payment method on a recurring basis.

6.3 Overages. Agency plan subscribers are charged $0.005 per request beyond the 50,000/month included limit. Overage charges are billed at the end of each billing cycle.

6.4 Refunds. We offer a pro-rated refund for the unused portion of a subscription if you cancel within the first 7 days of a new billing period. After 7 days, no refunds are issued for the current billing period. Cancellations take effect at the end of the current billing period.

6.5 Price Changes. We will provide at least 30 days' notice before increasing prices for existing subscribers. Continued use after the effective date constitutes acceptance of the new pricing.`,
  },
  {
    id: "third-party",
    title: "7. Third-Party Services",
    content: `The Service acts as a proxy to third-party APIs (OpenAI, Anthropic, Google, and others). We are not affiliated with, endorsed by, or responsible for the availability, accuracy, or terms of those third-party services. Your use of third-party APIs through the Service remains subject to those providers' own terms of service. We do not guarantee that the LLM analysis output will resolve every error or that our suggested fixes are accurate for all API versions.`,
  },
  {
    id: "ip",
    title: "8. Intellectual Property",
    content: `8.1 Our IP. The Service, including its software, design, trademarks, and content, is owned by Freedom Engineers and protected by applicable intellectual property laws. Nothing in these Terms grants you any right to use our trademarks, logos, or brand elements.

8.2 Your Data. You retain ownership of all data you transmit through the Service. By using the Service, you grant us a limited, non-exclusive license to process your data solely as necessary to provide the Service.

8.3 Feedback. If you provide us with feedback, suggestions, or ideas about the Service, you grant us a perpetual, irrevocable, royalty-free license to use that feedback without restriction or compensation to you.`,
  },
  {
    id: "warranties",
    title: "9. Disclaimer of Warranties",
    content: `THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT DEFECTS WILL BE CORRECTED.

THE LLM-GENERATED ERROR ANALYSIS AND FIX SUGGESTIONS ARE PROVIDED FOR INFORMATIONAL PURPOSES ONLY. WE MAKE NO WARRANTY THAT FOLLOWING THE SUGGESTED FIXES WILL RESOLVE YOUR ERRORS OR THAT THE ANALYSIS IS ACCURATE FOR YOUR SPECIFIC USE CASE.`,
  },
  {
    id: "liability",
    title: "10. Limitation of Liability",
    content: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL FREEDOM ENGINEERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM OR (B) $100.`,
  },
  {
    id: "indemnification",
    title: "11. Indemnification",
    content: `You agree to indemnify, defend, and hold harmless Freedom Engineers and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in connection with your use of the Service, your violation of these Terms, or your violation of any third-party rights.`,
  },
  {
    id: "termination",
    title: "12. Termination",
    content: `We may suspend or terminate your access to the Service at any time, with or without cause, with or without notice. Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should survive termination (including Sections 8, 9, 10, 11, and 13) will survive.

You may terminate your account at any time by canceling your subscription and deleting your account from the dashboard settings.`,
  },
  {
    id: "governing-law",
    title: "13. Governing Law and Disputes",
    content: `These Terms are governed by the laws of the State of Delaware, United States, without regard to its conflict of law provisions. Any dispute arising out of or relating to these Terms or the Service shall be resolved by binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, except that either party may seek injunctive relief in a court of competent jurisdiction for intellectual property matters.`,
  },
  {
    id: "changes",
    title: "14. Changes to Terms",
    content: `We reserve the right to modify these Terms at any time. We will notify you of material changes by email or by posting a notice on the dashboard at least 14 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the revised Terms.`,
  },
  {
    id: "contact",
    title: "15. Contact",
    content: `For questions about these Terms, contact us at:\n\nFreedom Engineers\nhello@gracefulfail.dev\ngracefulfail.dev`,
  },
];

export default function Terms() {
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
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
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
          <h1 className="text-4xl font-bold tracking-tight mb-3">Terms of Service</h1>
          <p className="text-muted-foreground text-sm">
            Effective Date: March 27, 2026 &nbsp;·&nbsp; Last Updated: March 27, 2026
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
