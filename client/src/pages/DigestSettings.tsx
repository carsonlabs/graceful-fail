import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Calendar, BarChart2, Zap, TrendingDown } from "lucide-react";

export default function DigestSettings() {
  const utils = trpc.useUtils();
  const { data: pref, isLoading } = trpc.digest.getPreference.useQuery();

  const setEnabledMutation = trpc.digest.setEnabled.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.enabled ? "Weekly digest enabled" : "Weekly digest disabled");
      utils.digest.getPreference.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendNowMutation = trpc.digest.sendNow.useMutation({
    onSuccess: (result) => {
      if (result.sent) {
        toast.success("Digest sent! Check your notifications.");
      } else {
        toast.error(result.reason ?? "Could not send digest");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const enabled = pref?.enabled ?? true;

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Weekly Digest</h1>
            <p className="text-sm text-muted-foreground">A weekly summary of your API health, errors intercepted, and credits used</p>
          </div>
        </div>

        {/* Toggle card */}
        <Card className="mb-6">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Weekly digest emails</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Sent every Monday morning with your 7-day summary
                </p>
              </div>
              {isLoading ? (
                <div className="w-10 h-5 bg-muted rounded-full animate-pulse" />
              ) : (
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => setEnabledMutation.mutate({ enabled: checked })}
                  disabled={setEnabledMutation.isPending}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preview card */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">What's in your digest</CardTitle>
              <Badge variant="secondary" className="text-xs">Every Monday</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  icon: BarChart2,
                  label: "Total requests",
                  desc: "All proxy requests made in the past 7 days",
                },
                {
                  icon: Zap,
                  label: "Errors intercepted",
                  desc: "How many 4xx/5xx errors were caught and analyzed",
                },
                {
                  icon: TrendingDown,
                  label: "Top failing APIs",
                  desc: "The 3 destination APIs with the most failures",
                },
                {
                  icon: Calendar,
                  label: "Credits used",
                  desc: "Credits consumed this week vs. your plan limit",
                },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Send now */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Send digest now</CardTitle>
            <CardDescription>Preview your digest without waiting for Monday</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => sendNowMutation.mutate()}
              disabled={sendNowMutation.isPending || !enabled}
            >
              <Mail className="w-4 h-4 mr-2" />
              {sendNowMutation.isPending ? "Sending..." : "Send me this week's digest"}
            </Button>
            {!enabled && (
              <p className="text-xs text-muted-foreground mt-2">Enable the digest above to send a preview.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
