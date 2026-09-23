import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CalendarPage from "./pages/CalendarPage";
import AdminInvoiceManagement from "./pages/AdminInvoiceManagement";
import AppointmentValidation from "./pages/AppointmentValidation";
import Home from "./pages/Home";
import GateHistoryPage from "./pages/GateHistoryPage";
import Login from "./pages/Login";
import PasswordReset from "./pages/PasswordReset";
import AccessRequests from "./pages/AccessRequests";
import NotFound from "./pages/NotFound";
import OperacaoPage from "./pages/OperacaoPage";
import OperatorDashboard from "./pages/OperatorDashboard";
import OperatorOverview from "./pages/OperatorOverview";
import PortariaPage from "./pages/PortariaPage";
import ImportarAcervo from "@/pages/ImportarAcervo";
import EmpresasPage from "@/pages/EmpresasPage";
import BacklogPage from "@/pages/BacklogPage";
import ReportsPage from "./pages/ReportsPage";
import SupplierDashboard from "./pages/SupplierDashboard";
import SupplierSuggestions from "./pages/SupplierSuggestions";

function Router() { return <Switch><Route path="/" component={Home} /><Route path="/entrar" component={Login} /><Route path="/entrar/:profile" component={Login} /><Route path="/validar-agendamento" component={AppointmentValidation} /><Route path="/redefinir-senha" component={PasswordReset} /><Route path="/operador" component={OperatorDashboard} /><Route path="/operador/dashboard" component={OperatorOverview} /><Route path="/operador/calendario" component={CalendarPage} /><Route path="/operador/relatorios" component={ReportsPage} /><Route path="/operador/relatorios/backlog" component={ReportsPage} /><Route path="/operador/backlog" component={BacklogPage} /><Route path="/operador/notas" component={AdminInvoiceManagement} /><Route path="/operador/acessos" component={AccessRequests} /><Route path="/operador/empresas" component={EmpresasPage} /><Route path="/operador/importar" component={ImportarAcervo} /><Route path="/portaria" component={PortariaPage} /><Route path="/portaria/historico" component={GateHistoryPage} /><Route path="/operacao" component={OperacaoPage} /><Route path="/fornecedor" component={SupplierDashboard} /><Route path="/fornecedor/sugestoes" component={SupplierSuggestions} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
export default function App() { return <ErrorBoundary><ThemeProvider><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
