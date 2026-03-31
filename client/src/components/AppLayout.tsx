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
  Sun,
  Moon,
  Slack,
  Mail,
  Menu,
  X,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useIsMobile } from "@/hooks/useMobile";

const NAV_SECTIONS = [
  {
    label: "Core",
    items: [
      { href: "/dashboard/playground", label: "Try It", icon: FlaskConical },
      { href: "/dashboard/logs", label: "Request Logs", icon: List },
      { href: "/dashboard/keys", label: "API Keys", icon: Key },
      { href: "/docs", label: "API Docs", icon: BookOpen },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/usage", label: "Usage", icon: BarChart2 },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/dashboard/integrations/slack", label: "Slack", icon: Slack },
      { href: "/dashboard/integrations/sentry", label: "Sentry", icon: Shield },
      { href: "/dashboard/digest", label: "Weekly Digest", icon: Mail },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
    ],
  },
];

function SidebarContent({
  user,
  location,
  theme,
  toggleTheme,
  onLogout,
  onNavClick,
}: {
  user: { name?: string | null; email?: string | null } | null;
  location: string;
  theme: string;
  toggleTheme: (() => void) | undefined;
  onLogout: () => void;
  onNavClick?: () => void;
}) {
  return (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-sidebar-border shrink-0">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-sm tracking-tight">SelfHeal</span>
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
                    onClick={onNavClick}
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
      <div className="border-t border-sidebar-border p-3 shrink-0">
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
          onClick={onLogout}
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </Button>
      </div>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location, navigate] = useLocation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Logged out successfully");
      navigate("/");
    },
  });

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

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

  const activeLabel = NAV_SECTIONS
    .flatMap((s) => s.items)
    .find((item) => item.href === location)?.label ?? "Dashboard";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border flex-col bg-sidebar">
        <SidebarContent
          user={user}
          location={location}
          theme={theme}
          toggleTheme={toggleTheme}
          onLogout={() => logoutMutation.mutate()}
        />
      </aside>

      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
            onClick={() => setMobileOpen(false)}
          />
          {/* Slide-out sidebar */}
          <aside className="fixed inset-y-0 left-0 w-72 z-50 bg-sidebar border-r border-border flex flex-col animate-in slide-in-from-left duration-200">
            <div className="absolute top-4 right-3 z-10">
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <SidebarContent
              user={user}
              location={location}
              theme={theme}
              toggleTheme={toggleTheme}
              onLogout={() => logoutMutation.mutate()}
              onNavClick={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-auto">
        {/* Mobile header */}
        {isMobile && (
          <header className="h-14 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-9 h-9 p-0"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                  <Zap className="w-3 h-3 text-primary-foreground" />
                </div>
                <span className="font-medium text-sm text-foreground">{activeLabel}</span>
              </div>
            </div>
            {toggleTheme && (
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 text-muted-foreground"
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            )}
          </header>
        )}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
