import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Zap, ArrowUpRight, CreditCard, AlertTriangle } from "lucide-react";

const TIERS = [
  {
    key: "hobby" as const,
    name: "Hobby",
    price: "Free",
    period: "",
    limit: "500 req/mo",
    features: ["500 proxied requests", "LLM error analysis", "API key management", "7-day request logs"],
  },
  {
    key: "pro" as const,
    name: "Pro",
    price: "$29",
    period: "/month",
    limit: "10,000 req/mo",
    features: ["10,000 proxied requests", "LLM error analysis", "Multiple API keys", "30-day request logs", "Usage analytics", "Email support"],
    highlight: true,
  },
  {
    key: "agency" as const,
    name: "Agency",
    price: "$99",
    period: "/month",
    limit: "50,000 req/mo",
    features: ["50,000 proxied requests", "$0.005/extra request", "Unlimited API keys", "90-day request logs", "Full analytics", "Priority support"],
  },
];

export default function Billing() {
  const { data: sub, isLoading } = trpc.billing.status.useQuery();
  const checkoutMutation = trpc.billing.createCheckout.useMutation({
    onSuccess: ({ checkoutUrl }) => {
      if (checkoutUrl) {
        toast.info("Redirecting to Stripe checkout...");
        window.open(checkoutUrl, "_blank");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const portalMutation = trpc.billing.createPortal.useMutation({
    onSuccess: ({ portalUrl }) => {
      window.open(portalUrl, "_blank");
    },
    onError: (e) => toast.error(e.message),
  });

  const currentTier = sub?.tier ?? "hobby";
  const isActive = !sub || sub.status === "active" || sub.status === "trialing";

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Billing & Plan</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your subscription and upgrade your plan
          </p>
        </div>

        {/* Current plan status */}
        <Card className="bg-card border-border mb-8">
          <CardContent className="px-6 py-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Plan</p>
                  {isLoading ? (
                    <div className="h-6 w-24 bg-muted rounded animate-pulse mt-1" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold text-foreground capitalize">{currentTier}</p>
                      {sub && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                        }`}>
                          {sub.status}
                        </span>
                      )}
                    </div>
                  )}
                  {sub?.currentPeriodEnd && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              {sub?.stripeCustomerId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => portalMutation.mutate({ origin: window.location.origin })}
                  disabled={portalMutation.isPending}
                >
                  <CreditCard className="w-4 h-4" />
                  Manage Subscription
                </Button>
              )}
            </div>
            {sub?.status === "past_due" && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-300">
                  Your subscription payment is past due. Please update your payment method to avoid service interruption.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tier cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {TIERS.map(({ key, name, price, period, limit, features, highlight }) => {
            const isCurrent = currentTier === key;
            return (
              <Card
                key={key}
                className={`flex flex-col ${
                  highlight
                    ? "border-primary bg-primary/5 shadow-[0_0_30px_oklch(0.75_0.18_145_/_0.12)]"
                    : "border-border bg-card"
                } ${isCurrent ? "ring-2 ring-primary/40" : ""}`}
              >
                <CardHeader className="px-6 pt-6 pb-3">
                  {highlight && (
                    <div className="text-xs font-semibold text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1 self-start mb-3">
                      Most Popular
                    </div>
                  )}
                  {isCurrent && (
                    <div className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1 self-start mb-3">
                      Current Plan
                    </div>
                  )}
                  <CardTitle className="text-base font-semibold">{name}</CardTitle>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold text-foreground">{price}</span>
                    <span className="text-muted-foreground text-sm">{period}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{limit}</p>
                </CardHeader>
                <CardContent className="px-6 pb-6 flex flex-col flex-1">
                  <ul className="space-y-2.5 flex-1 mb-6">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : key === "hobby" ? (
                    <Button variant="outline" className="w-full" disabled>
                      Free Forever
                    </Button>
                  ) : (
                    <Button
                      variant={highlight ? "default" : "outline"}
                      className="w-full gap-2"
                      onClick={() =>
                        checkoutMutation.mutate({
                          tier: key,
                          origin: window.location.origin,
                        })
                      }
                      disabled={checkoutMutation.isPending}
                    >
                      {checkoutMutation.isPending ? "Redirecting..." : `Upgrade to ${name}`}
                      <ArrowUpRight className="w-4 h-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Test payments: use card <code className="font-mono bg-muted px-1 rounded">4242 4242 4242 4242</code> with any future expiry and CVC.
        </p>
      </div>
    </AppLayout>
  );
}
