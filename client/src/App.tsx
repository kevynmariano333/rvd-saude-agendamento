import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CalendarPage from "./pages/CalendarPage";
import AdminInvoiceManagement from "./pages/AdminInvoiceManagement";
import AppointmentValidation from "./pages/AppointmentValidation";
import Login from "./pages/Login";
import PasswordReset from "./pages/PasswordReset";
import NotFound from "./pages/NotFound";
import OperatorDashboard from "./pages/OperatorDashboard";
import OperatorOverview from "./pages/OperatorOverview";
import ReportsPage from "./pages/ReportsPage";
import SupplierDashboard from "./pages/SupplierDashboard";
import SupplierSuggestions from "./pages/SupplierSuggestions";

function Router() { return <Switch><Route path="/" component={Login} /><Route path="/validar-agendamento" component={AppointmentValidation} /><Route path="/redefinir-senha" component={PasswordReset} /><Route path="/operador" component={OperatorDashboard} /><Route path="/operador/dashboard" component={OperatorOverview} /><Route path="/operador/calendario" component={CalendarPage} /><Route path="/operador/relatorios" component={ReportsPage} /><Route path="/operador/notas" component={AdminInvoiceManagement} /><Route path="/fornecedor" component={SupplierDashboard} /><Route path="/fornecedor/sugestoes" component={SupplierSuggestions} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
