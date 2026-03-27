import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ApiKeys from "./pages/ApiKeys";
import RequestLogs from "./pages/RequestLogs";
import UsageAnalytics from "./pages/UsageAnalytics";
import Billing from "./pages/Billing";
import Webhooks from "./pages/Webhooks";
import Playground from "./pages/Playground";
import Docs from "./pages/Docs";
import StatusPage from "./pages/Status";
import Changelog from "./pages/Changelog";
import Referral from "./pages/Referral";
import SlackIntegration from "./pages/SlackIntegration";
import DigestSettings from "./pages/DigestSettings";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/keys" component={ApiKeys} />
      <Route path="/dashboard/logs" component={RequestLogs} />
      <Route path="/dashboard/usage" component={UsageAnalytics} />
      <Route path="/dashboard/billing" component={Billing} />
      <Route path="/dashboard/webhooks" component={Webhooks} />
      <Route path="/dashboard/playground" component={Playground} />
      <Route path="/docs" component={Docs} />
      <Route path="/status" component={StatusPage} />
      <Route path="/changelog" component={Changelog} />
      <Route path="/dashboard/referral" component={Referral} />
      <Route path="/dashboard/integrations/slack" component={SlackIntegration} />
      <Route path="/dashboard/digest" component={DigestSettings} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
