import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Key, Plus, Copy, Trash2, AlertTriangle, CheckCircle2, Pencil, Check, X } from "lucide-react";

type Tier = "hobby" | "pro" | "agency";

export default function ApiKeys() {
  const utils = trpc.useUtils();
  const { data: keys, isLoading } = trpc.apiKeys.list.useQuery();
  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: () => utils.apiKeys.list.invalidate(),
  });
  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      utils.apiKeys.list.invalidate();
      toast.success("API key revoked");
    },
  });
  const renameMutation = trpc.apiKeys.rename.useMutation({
    onSuccess: () => {
      utils.apiKeys.list.invalidate();
      setEditingId(null);
      toast.success("Key renamed");
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<Tier>("hobby");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return toast.error("Please enter a key name");
    const result = await createMutation.mutateAsync({ name: name.trim(), tier });
    setNewKey(result.rawKey);
    setName("");
    setTier("hobby");
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Copied to clipboard");
  };

  const TIER_LIMITS: Record<Tier, string> = {
    hobby: "500 req/mo",
    pro: "10,000 req/mo",
    agency: "50,000 req/mo",
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">API Keys</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your SelfHeal API keys. Keys are hashed — we never store the plaintext.
            </p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setNewKey(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> New API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>{newKey ? "Save Your API Key" : "Create New API Key"}</DialogTitle>
              </DialogHeader>

              {newKey ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 flex gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-300">
                      This is the only time you'll see this key. Copy it now and store it securely.
                    </p>
                  </div>
                  <div className="rounded-lg bg-background border border-border p-3 flex items-center justify-between gap-3">
                    <code className="text-xs font-mono text-primary break-all">{newKey}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => copyKey(newKey)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button className="w-full" onClick={() => { setOpen(false); setNewKey(null); }}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> I've saved my key
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="key-name" className="text-sm">Key Name</Label>
                    <Input
                      id="key-name"
                      placeholder="e.g. Production Agent, n8n Workflow"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1.5 bg-background border-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tier" className="text-sm">Tier</Label>
                    <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
                      <SelectTrigger id="tier" className="mt-1.5 bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="hobby">Hobby — 500 req/mo (Free)</SelectItem>
                        <SelectItem value="pro">Pro — 10,000 req/mo ($149/mo)</SelectItem>
                        <SelectItem value="agency">Agency — 50,000 req/mo ($349/mo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? "Creating..." : "Create Key"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Revoke confirm dialog */}
        <Dialog open={revokeId !== null} onOpenChange={(v) => !v && setRevokeId(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Revoke API Key?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This action is permanent. Any agents using this key will immediately lose access.
            </p>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" className="flex-1" onClick={() => setRevokeId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  if (revokeId) revokeMutation.mutate({ id: revokeId });
                  setRevokeId(null);
                }}
              >
                Revoke Key
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Keys list */}
        <Card className="bg-card border-border">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">Active Keys ({keys?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : !keys?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <Key className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No API keys yet. Create your first key to start proxying.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border bg-background hover:border-border/80 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Key className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        {editingId === key.id ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-7 text-sm bg-background border-border w-48"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && editName.trim()) {
                                  renameMutation.mutate({ id: key.id, name: editName.trim() });
                                } else if (e.key === "Escape") {
                                  setEditingId(null);
                                }
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-emerald-400"
                              onClick={() => editName.trim() && renameMutation.mutate({ id: key.id, name: editName.trim() })}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <p className="text-sm font-medium text-foreground">{key.name}</p>
                            <button
                              onClick={() => { setEditingId(key.id); setEditName(key.name); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {key.keyPrefix}••••••••••••••••
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            key.tier === "agency"
                              ? "bg-purple-500/15 text-purple-400"
                              : key.tier === "pro"
                                ? "bg-blue-500/15 text-blue-400"
                                : "bg-zinc-500/15 text-zinc-400"
                          }`}
                        >
                          {key.tier}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">{TIER_LIMITS[key.tier]}</p>
                      </div>
                      <div className="text-right hidden md:block">
                        <p className="text-xs text-muted-foreground">
                          {key.lastUsedAt
                            ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                            : "Never used"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(key.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setRevokeId(key.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage info */}
        <Card className="bg-card border-border mt-6">
          <CardContent className="px-5 py-5">
            <h3 className="text-sm font-semibold mb-3">How to use your key</h3>
            <pre className="text-xs font-mono text-foreground/80 bg-background rounded-lg border border-border p-4 overflow-x-auto whitespace-pre">{`curl -X POST https://selfheal.dev/api/proxy \\
  -H "Authorization: Bearer ${keys?.[0]?.keyPrefix ? `${keys[0].keyPrefix}••••••••` : "gf_your_key_here"}" \\
  -H "X-Destination-URL: https://api.example.com/endpoint" \\
  -H "X-Destination-Method: POST" \\
  -H "Content-Type: application/json" \\
  -d '{"your": "payload"}'`}</pre>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
