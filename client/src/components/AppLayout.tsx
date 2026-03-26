import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link, useLocation } from "wouter";
import {
  BarChart2,
  Key,
  List,
  LayoutDashboard,
  LogOut,
  Zap,
  CreditCard,
  Webhook,
  FlaskConical,
  BookOpen,
  Activity,
  BookMarked,
  Share2,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";

const NAV_SECTIONS = [
  {
    label: "Proxy",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/keys", label: "API Keys", icon: Key },
      { href: "/dashboard/logs", label: "Request Logs", icon: List },
      { href: "/dashboard/usage", label: "Usage & Analytics", icon: BarChart2 },
      { href: "/dashboard/playground", label: "Playground", icon: FlaskConical },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/docs", label: "API Docs", icon: BookOpen },
      { href: "/status", label: "System Status", icon: Activity },
      { href: "/changelog", label: "Changelog", icon: BookMarked },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/referral", label: "Referral Program", icon: Share2 },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location, navigate] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Logged out successfully");
      navigate("/");
    },
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [loading, isAuthenticated]);

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col bg-sidebar">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground text-sm tracking-tight">Graceful Fail</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-3 mb-1">
                {label}
              </p>
              <div className="space-y-0.5">
                {items.map(({ href, label: itemLabel, icon: Icon }) => {
                  const isActive = location === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary font-medium"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                      {itemLabel}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
              {user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name ?? "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
            </div>
          </div>
          {toggleTheme && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground text-xs gap-2 mb-0.5"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground text-xs gap-2"
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
