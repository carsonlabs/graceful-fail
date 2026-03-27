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
import { Slack, Trash2, Send, ExternalLink, CheckCircle2, AlertCircle, Info } from "lucide-react";

export default function SlackIntegration() {
  const utils = trpc.useUtils();
  const { data: config, isLoading } = trpc.slack.getConfig.useQuery();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [channel, setChannel] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const saveMutation = trpc.slack.save.useMutation({
    onSuccess: () => {
      toast.success("Slack webhook saved!");
      setIsEditing(false);
      setWebhookUrl("");
      setChannel("");
      utils.slack.getConfig.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const testMutation = trpc.slack.test.useMutation({
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.slack.delete.useMutation({
    onSuccess: () => {
      toast.success("Slack integration removed");
      utils.slack.getConfig.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.slack.toggle.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.enabled ? "Slack alerts enabled" : "Slack alerts paused");
      utils.slack.getConfig.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
      toast.error("Must be a valid Slack Incoming Webhook URL");
      return;
    }
    saveMutation.mutate({ webhookUrl, channel: channel || null, enabled: true });
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#4A154B] flex items-center justify-center">
            <Slack className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Slack Integration</h1>
            <p className="text-sm text-muted-foreground">Get instant alerts in Slack when non-retriable errors are intercepted</p>
          </div>
        </div>

        {/* How it works */}
        <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-3">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How it works</p>
                <p>When your agent hits a non-retriable error (like an invalid API key or a malformed request), SelfHeal sends a rich Slack message with the error details and the exact fix your agent needs.</p>
                <a
                  href="https://api.slack.com/messaging/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-500 hover:underline mt-1"
                >
                  How to create a Slack Incoming Webhook <ExternalLink className="w-3 h-3" />
                </a>
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
                  <CardTitle className="text-base">Slack Connected</CardTitle>
                </div>
                <Badge variant={config.enabled ? "default" : "secondary"}>
                  {config.enabled ? "Active" : "Paused"}
                </Badge>
              </div>
              <CardDescription>
                Alerts will be sent to {config.channel ? <span className="font-mono text-foreground">{config.channel}</span> : "your default channel"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Webhook URL (masked) */}
              <div className="p-3 rounded-md bg-muted/50 font-mono text-xs text-muted-foreground break-all">
                {config.webhookUrl.replace(/\/[^/]+$/, "/••••••••")}
              </div>

              {/* Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-border">
                <div>
                  <p className="text-sm font-medium">Send alerts</p>
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
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {testMutation.isPending ? "Sending..." : "Send test message"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  Update URL
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive ml-auto"
                  onClick={() => {
                    if (confirm("Remove Slack integration?")) deleteMutation.mutate();
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Remove
                </Button>
              </div>

              {/* Inline edit form */}
              {isEditing && (
                <div className="border-t border-border pt-4 space-y-3">
                  <p className="text-sm font-medium">Update webhook URL</p>
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url" className="text-xs">Slack Webhook URL</Label>
                    <Input
                      id="webhook-url"
                      placeholder="https://hooks.slack.com/services/..."
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="channel" className="text-xs">Channel override (optional)</Label>
                    <Input
                      id="channel"
                      placeholder="#alerts"
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Setup form */
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect Slack</CardTitle>
              <CardDescription>
                Paste your Slack Incoming Webhook URL to start receiving alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Slack Webhook URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Create one at <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">api.slack.com/apps</a> → Your App → Incoming Webhooks
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel">Channel override <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="channel"
                  placeholder="#api-errors"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Leave blank to use the webhook's default channel</p>
              </div>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || !webhookUrl}
                className="w-full"
              >
                {saveMutation.isPending ? "Connecting..." : "Connect Slack"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* What triggers an alert */}
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">What triggers a Slack alert?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {[
                { icon: "🔐", label: "Auth errors", desc: "Invalid API keys, expired tokens, permission denied" },
                { icon: "📋", label: "Validation errors", desc: "Malformed payloads, missing required fields, wrong types" },
                { icon: "🔍", label: "Not found errors", desc: "Invalid model names, missing resources, wrong endpoints" },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex gap-3 py-1.5 border-b border-border last:border-0">
                  <span className="text-base">{icon}</span>
                  <div>
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">
                Rate limit (429) and server (5xx) errors are retriable and do not trigger alerts.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
