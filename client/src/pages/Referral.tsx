import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Users, Gift, Zap, Share2 } from "lucide-react";
import { toast } from "sonner";

export default function Referral() {
  const [copied, setCopied] = useState(false);
  const { data: codeData, isLoading: codeLoading } = trpc.referrals.getCode.useQuery();
  const { data: stats, isLoading: statsLoading } = trpc.referrals.getStats.useQuery();
  const { data: balance } = trpc.referrals.getBonusBalance.useQuery();

  const referralUrl = codeData?.code
    ? `${window.location.origin}/?ref=${codeData.code}`
    : "";

  function copyLink() {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      toast.success("Referral link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const statCards = [
    {
      title: "Total Referrals",
      value: statsLoading ? "—" : (stats?.totalReferrals ?? 0),
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      description: "Signups via your link",
    },
    {
      title: "Redeemed",
      value: statsLoading ? "—" : (stats?.redeemedReferrals ?? 0),
      icon: Check,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      description: "Completed referrals",
    },
    {
      title: "Bonus Credits Earned",
      value: statsLoading ? "—" : (stats?.bonusCreditsEarned ?? 0),
      icon: Zap,
      color: "text-primary",
      bg: "bg-primary/10",
      description: "Total credits awarded",
    },
    {
      title: "Credit Balance",
      value: balance ? balance.balance : 0,
      icon: Gift,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      description: "Available bonus credits",
    },
  ];

  return (
    <AppLayout>
      <div className="p-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Share2 className="w-6 h-6 text-primary" />
            Referral Program
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Share Graceful Fail with other developers. You both get <strong className="text-foreground">100 bonus credits</strong> when they sign up.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map(({ title, value, icon: Icon, color, bg, description }) => (
            <Card key={title} className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold text-foreground">{value}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Referral Link */}
        <Card className="bg-card border-border mb-6">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">Your Referral Link</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share this link. When someone signs up, you both receive 100 bonus credits automatically.
            </p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {codeLoading ? (
              <div className="h-10 bg-muted rounded-lg animate-pulse" />
            ) : (
              <div className="flex gap-2">
                <Input
                  value={referralUrl}
                  readOnly
                  className="font-mono text-xs bg-background border-border text-foreground"
                />
                <Button
                  onClick={copyLink}
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={!referralUrl}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            )}
            {codeData?.code && (
              <p className="text-xs text-muted-foreground mt-2">
                Your referral code: <span className="font-mono text-foreground font-semibold">{codeData.code}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="bg-card border-border">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-4">
              {[
                { step: "1", title: "Share your link", desc: "Copy your unique referral link above and share it with developers, AI agent builders, or anyone integrating APIs." },
                { step: "2", title: "They sign up", desc: "When someone creates a Graceful Fail account using your link, the referral is automatically tracked." },
                { step: "3", title: "Both of you get 100 credits", desc: "Once they sign up, 100 bonus credits are instantly added to both accounts — no waiting, no minimums." },
                { step: "4", title: "Credits offset LLM costs", desc: "Bonus credits are applied before your plan's monthly allowance, so every successful referral directly reduces your bill." },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
