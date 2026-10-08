import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import LoadingTruck from "./components/LoadingTruck";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

/**
 * Cada tela no seu próprio arquivo, baixado só quando alguém a abre.
 *
 * Antes tudo vinha num arquivo só de 1,4 MB: quem abria o portal para ver uma
 * nota baixava junto o calendário, os relatórios, a importação de acervo e as
 * telas de portaria e de pátio que ele nunca vai abrir. Numa internet de
 * hospital isso é a diferença entre a tela aparecer e a pessoa achar que o
 * sistema caiu.
 *
 * A porta de entrada — início, login e a tela de "não existe" — fica de fora
 * desta divisão de propósito: é o primeiro que todo mundo vê, e ela não pode
 * depender de um segundo arquivo chegar.
 */
const AppointmentValidation = lazy(() => import("./pages/AppointmentValidation"));
const PasswordReset = lazy(() => import("./pages/PasswordReset"));
const OperatorDashboard = lazy(() => import("./pages/OperatorDashboard"));
const OperatorOverview = lazy(() => import("./pages/OperatorOverview"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const RelatorioDeFornecedores = lazy(() => import("./pages/RelatorioDeFornecedores"));
const BacklogPage = lazy(() => import("@/pages/BacklogPage"));
const AdminInvoiceManagement = lazy(() => import("./pages/AdminInvoiceManagement"));
const AccessRequests = lazy(() => import("./pages/AccessRequests"));
const ImportarAcervo = lazy(() => import("@/pages/ImportarAcervo"));
const PortariaPage = lazy(() => import("./pages/PortariaPage"));
const GateHistoryPage = lazy(() => import("./pages/GateHistoryPage"));
const OperacaoPage = lazy(() => import("./pages/OperacaoPage"));
const SupplierDashboard = lazy(() => import("./pages/SupplierDashboard"));
const SupplierSuggestions = lazy(() => import("./pages/SupplierSuggestions"));

function Router() { return <Switch><Route path="/" component={Home} /><Route path="/entrar" component={Login} /><Route path="/entrar/:profile" component={Login} /><Route path="/validar-agendamento" component={AppointmentValidation} /><Route path="/redefinir-senha" component={PasswordReset} /><Route path="/operador" component={OperatorDashboard} /><Route path="/operador/dashboard" component={OperatorOverview} /><Route path="/operador/calendario" component={CalendarPage} /><Route path="/operador/relatorios" component={ReportsPage} /><Route path="/operador/relatorios/backlog" component={ReportsPage} /><Route path="/operador/relatorios/fornecedores" component={RelatorioDeFornecedores} /><Route path="/operador/backlog" component={BacklogPage} /><Route path="/operador/notas" component={AdminInvoiceManagement} /><Route path="/operador/acessos" component={AccessRequests} />{/* A tela de Empresas saiu; quem tinha o endereço salvo cai onde as contas são tratadas agora. */}<Route path="/operador/empresas"><Redirect to="/operador/acessos" /></Route><Route path="/operador/importar" component={ImportarAcervo} /><Route path="/portaria" component={PortariaPage} /><Route path="/portaria/historico" component={GateHistoryPage} /><Route path="/operacao" component={OperacaoPage} /><Route path="/fornecedor" component={SupplierDashboard} /><Route path="/fornecedor/sugestoes" component={SupplierSuggestions} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
export default function App() { return <ErrorBoundary><ThemeProvider><TooltipProvider><Toaster /><Suspense fallback={<LoadingTruck label="Abrindo a tela" />}><Router /></Suspense></TooltipProvider></ThemeProvider></ErrorBoundary>; }
