import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, CheckCircle2, Info, Copy, Check, Shield, Bug, Cpu, ArrowRight } from "lucide-react";

// Sentry brand icon (simplified)
function SentryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 66" className={className} fill="currentColor">
      <path d="M29 2.26a3.68 3.68 0 0 0-6.38 0L.55 46.56A3.68 3.68 0 0 0 3.74 52h8.1a3.68 3.68 0 0 0 3.19-1.84L29 22.42a12.73 12.73 0 0 1 10.1 12.42h-4.52a8.18 8.18 0 0 0-6.45-5.71l-7.64 13.23a12.73 12.73 0 0 1 12.3 0L44.35 22.1a17.28 17.28 0 0 0-15.35-9.36z" />
    </svg>
  );
}

export default function SentryIntegration() {
  const utils = trpc.useUtils();
  const { data: config, isLoading } = trpc.sentry.getConfig.useQuery();

  const [projectSlug, setProjectSlug] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState<string | null>(null);

  const setupMutation = trpc.sentry.setup.useMutation({
    onSuccess: (result) => {
      setNewSecret(result.webhookSecret);
      setNewWebhookUrl(result.webhookUrl);
      setProjectSlug("");
      utils.sentry.getConfig.invalidate();
      toast.success("Sentry integration created!");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.sentry.toggle.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.enabled ? "Sentry integration enabled" : "Sentry integration paused");
      utils.sentry.getConfig.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.sentry.delete.useMutation({
    onSuccess: () => {
      toast.success("Sentry integration removed");
      setNewSecret(null);
      setNewWebhookUrl(null);
      utils.sentry.getConfig.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function copyToClipboard(text: string, which: "secret" | "url") {
    navigator.clipboard.writeText(text).then(() => {
      if (which === "secret") {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } else {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      }
    });
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#362D59] flex items-center justify-center">
            <SentryIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Sentry Integration</h1>
            <p className="text-sm text-muted-foreground">Pipe Sentry errors through SelfHeal for automated LLM analysis</p>
          </div>
        </div>

        {/* How it works */}
        <Card className="mb-6 border-purple-500/20 bg-purple-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-3">
              <Info className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How it works</p>
                <p>Configure a Sentry webhook to send issue events to SelfHeal. Each error is automatically analyzed by our LLM pipeline, giving you structured fix instructions alongside your Sentry alerts.</p>
                <ol className="list-decimal list-inside space-y-0.5 text-xs mt-2">
                  <li>Generate a webhook secret below</li>
                  <li>In Sentry, go to <span className="font-medium text-foreground">Settings &rarr; Integrations &rarr; Internal Integrations</span></li>
                  <li>Create a new integration with the webhook URL and secret</li>
                  <li>Enable the <span className="font-medium text-foreground">issue</span> webhook event</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : config ? (
          /* Existing config */
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <CardTitle className="text-base">Sentry Connected</CardTitle>
                </div>
                <Badge variant={config.enabled ? "default" : "secondary"}>
                  {config.enabled ? "Active" : "Paused"}
                </Badge>
              </div>
              <CardDescription>
                {config.projectSlug
                  ? <>Filtering for project <span className="font-mono text-foreground">{config.projectSlug}</span></>
                  : "Receiving events from all Sentry projects"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Webhook URL */}
              <div>
                <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 p-3 rounded-md bg-muted/50 font-mono text-xs text-muted-foreground break-all">
                    {config.webhookUrl}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => copyToClipboard(config.webhookUrl, "url")}
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Secret (masked) */}
              <div>
                <Label className="text-xs text-muted-foreground">Webhook Secret</Label>
                <div className="p-3 rounded-md bg-muted/50 font-mono text-xs text-muted-foreground mt-1">
                  {config.webhookSecretPrefix}
                </div>
              </div>

              {/* Newly created secret (show once) */}
              {newSecret && (
                <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-amber-400">Copy your secret now — it won't be shown again</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(newSecret, "secret")}
                    >
                      {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <p className="font-mono text-xs text-foreground break-all">{newSecret}</p>
                </div>
              )}

              {/* Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-border">
                <div>
                  <p className="text-sm font-medium">Process Sentry events</p>
                  <p className="text-xs text-muted-foreground">Pause without removing the integration</p>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(checked) => toggleMutation.mutate({ enabled: checked })}
                  disabled={toggleMutation.isPending}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setupMutation.mutate({ projectSlug: null })}
                  disabled={setupMutation.isPending}
                >
                  {setupMutation.isPending ? "Regenerating..." : "Regenerate Secret"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive ml-auto"
                  onClick={() => {
                    if (confirm("Remove Sentry integration? You'll need to reconfigure the webhook in Sentry.")) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Setup form */
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect Sentry</CardTitle>
              <CardDescription>
                Generate a webhook secret to start receiving Sentry error events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-slug">Project slug <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="project-slug"
                  placeholder="my-backend"
                  value={projectSlug}
                  onChange={(e) => setProjectSlug(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Filter events to a specific Sentry project. Leave blank to receive all.</p>
              </div>
              <Button
                onClick={() => setupMutation.mutate({ projectSlug: projectSlug || null })}
                disabled={setupMutation.isPending}
                className="w-full"
              >
                {setupMutation.isPending ? "Setting up..." : "Generate Webhook Secret"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* What SelfHeal does with Sentry events */}
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">What happens when Sentry sends an event?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {[
                { icon: Bug, label: "Error captured", desc: "Sentry sends the issue event with stack trace, exception details, and context" },
                { icon: Cpu, label: "LLM analysis", desc: "SelfHeal runs the error through our analysis pipeline — same engine as the proxy" },
                { icon: Shield, label: "Fix stored", desc: "Structured fix instructions are stored in your request logs with source: sentry" },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex gap-3 py-1.5 border-b border-border last:border-0">
                  <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <ArrowRight className="w-3 h-3" />
              <span>View Sentry-analyzed errors in <a href="/dashboard/logs" className="text-primary hover:underline">Request Logs</a> — filter by source</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
