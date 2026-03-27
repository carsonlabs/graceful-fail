import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Send,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Power,
  Copy,
  Webhook,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const EVENT_OPTIONS = [
  { value: "all", label: "All Events", description: "Receive every webhook event" },
  { value: "rate_limit", label: "Rate Limit Hit", description: "When a key exhausts its monthly quota" },
  { value: "non_retriable_error", label: "Non-Retriable Error", description: "When LLM determines an error cannot be fixed by retrying" },
] as const;

function DeliveryLog({ endpointId }: { endpointId: number }) {
  const { data: deliveries, isLoading } = trpc.webhooks.deliveries.useQuery({ endpointId, limit: 10 });

  if (isLoading) return <div className="text-xs text-muted-foreground p-3">Loading deliveries...</div>;
  if (!deliveries?.length) return <div className="text-xs text-muted-foreground p-3">No deliveries yet.</div>;

  return (
    <div className="divide-y divide-border">
      {deliveries.map((d) => (
        <div key={d.id} className="flex items-start gap-3 px-4 py-3">
          {d.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-foreground">{d.event}</span>
              {d.responseStatusCode && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  d.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                }`}>
                  HTTP {d.responseStatusCode}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{d.attempts} attempt{d.attempts !== 1 ? "s" : ""}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function WebhookRow({ endpoint }: { endpoint: any }) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const deleteMutation = trpc.webhooks.delete.useMutation({
    onSuccess: () => {
      toast.success("Webhook endpoint deleted");
      utils.webhooks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.webhooks.toggle.useMutation({
    onSuccess: () => utils.webhooks.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const testMutation = trpc.webhooks.test.useMutation({
    onSuccess: () => toast.success("Test event dispatched!"),
    onError: (e) => toast.error(e.message),
  });

  const events: string[] = (() => {
    try { return JSON.parse(endpoint.events); } catch { return ["all"]; }
  })();

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-card">
        <div className={`w-2 h-2 rounded-full shrink-0 ${endpoint.isActive ? "bg-emerald-400" : "bg-muted-foreground"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-foreground truncate">{endpoint.url}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {events.map((e: string) => (
              <span key={e} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{e}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={endpoint.isActive ? "Disable" : "Enable"}
            onClick={() => toggleMutation.mutate({ id: endpoint.id, isActive: !endpoint.isActive })}
          >
            <Power className={`w-3.5 h-3.5 ${endpoint.isActive ? "text-emerald-400" : "text-muted-foreground"}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Send test event"
            onClick={() => testMutation.mutate({ id: endpoint.id })}
            disabled={testMutation.isPending}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-400 hover:text-red-300"
            title="Delete"
            onClick={() => deleteMutation.mutate({ id: endpoint.id })}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground px-4 pt-3 pb-1 uppercase tracking-wide">Recent Deliveries</p>
          <DeliveryLog endpointId={endpoint.id} />
        </div>
      )}
    </div>
  );
}

export default function Webhooks() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["all"]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: endpoints, isLoading } = trpc.webhooks.list.useQuery();

  const createMutation = trpc.webhooks.create.useMutation({
    onSuccess: ({ secret }) => {
      setNewSecret(secret);
      utils.webhooks.list.invalidate();
      setUrl("");
      setSelectedEvents(["all"]);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleEvent = (value: string) => {
    if (value === "all") {
      setSelectedEvents(["all"]);
    } else {
      const without = selectedEvents.filter((e) => e !== "all" && e !== value);
      setSelectedEvents(without.includes(value) ? without : [...without, value]);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Webhook Endpoints</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Receive real-time notifications when rate limits are hit or non-retriable errors occur
            </p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setNewSecret(null); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Endpoint
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Webhook Endpoint</DialogTitle>
              </DialogHeader>
              {newSecret ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
                    <p className="text-sm font-semibold text-emerald-400 mb-2">Endpoint created! Save your signing secret</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      This secret is shown only once. Use it to verify webhook signatures with HMAC-SHA256.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1.5 break-all text-foreground">
                        {newSecret}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => { navigator.clipboard.writeText(newSecret); toast.success("Secret copied!"); }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => { setOpen(false); setNewSecret(null); }}>
                    Done
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="webhook-url">Endpoint URL</Label>
                    <Input
                      id="webhook-url"
                      placeholder="https://your-server.com/webhooks/gracefulfail"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">Events to receive</Label>
                    <div className="space-y-2">
                      {EVENT_OPTIONS.map(({ value, label, description }) => (
                        <label key={value} className="flex items-start gap-3 cursor-pointer">
                          <Checkbox
                            checked={selectedEvents.includes(value)}
                            onCheckedChange={() => toggleEvent(value)}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground">{label}</p>
                            <p className="text-xs text-muted-foreground">{description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => createMutation.mutate({ url, events: selectedEvents as any })}
                    disabled={!url || selectedEvents.length === 0 || createMutation.isPending}
                  >
                    {createMutation.isPending ? "Creating..." : "Create Endpoint"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Signature verification guide */}
        <Card className="bg-muted/30 border-border mb-6">
          <CardContent className="px-5 py-4">
            <div className="flex items-start gap-3">
              <Webhook className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Verifying webhook signatures</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Each request includes an <code className="font-mono bg-muted px-1 rounded">X-GracefulFail-Signature</code> header.
                  Verify it with: <code className="font-mono bg-muted px-1 rounded">HMAC-SHA256(payload, your_secret)</code> and compare to the header value after the <code className="font-mono bg-muted px-1 rounded">sha256=</code> prefix.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Endpoint list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : !endpoints?.length ? (
          <Card className="border-dashed border-border bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Webhook className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">No webhook endpoints yet</p>
              <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
                Add an endpoint to receive real-time notifications when your agents hit rate limits or encounter non-retriable errors
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {endpoints.map((ep) => (
              <WebhookRow key={ep.id} endpoint={ep} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
