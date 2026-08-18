import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import OperatorDashboard from "./pages/OperatorDashboard";
import SupplierDashboard from "./pages/SupplierDashboard";

function Router() {
  return <Switch><Route path="/" component={Login} /><Route path="/operador" component={OperatorDashboard} /><Route path="/fornecedor" component={SupplierDashboard} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
