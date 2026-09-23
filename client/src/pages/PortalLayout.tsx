import { Button } from "@/components/ui/button";
import { canSeeGateHistory, canTreatBacklogPortal, isPortalAdmin, isPortalGate, isPortalOperator, isPortalPlanner, isPortalYard, roleLabel, type PortalRole } from "@/lib/portal";
import { serviceTypeCopy } from "@/lib/attendance";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MonitorSmartphone,
  Moon,
  PackageCheck,
  ShieldCheck,
  Sun,
  Truck,
  UserCheck,
  UserRound,
  X,
  type LucideIcon, DatabaseBackup} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTheme, type ThemeChoice } from "../contexts/ThemeContext";
import ChangeNameDialog from "../components/ChangeNameDialog";
import ChangePasswordDialog from "../components/ChangePasswordDialog";
import { useLocation } from "wouter";

/** Claro, escuro, ou acompanhar o aparelho. */
const themeOptions: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: "claro", label: "Claro", icon: Sun },
  { value: "escuro", label: "Escuro", icon: Moon },
  { value: "sistema", label: "Sistema", icon: MonitorSmartphone },
];

type PortalUser = { id: number; name: string | null; email: string | null; role: string };

/** Item da barra de navegação. O badge é a contagem que pede atenção agora. */
type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
  /** Quando existe, o item abre um menu em vez de navegar direto. */
  grupo?: string;
  filhos?: { label: string; path: string }[];
};

export default function PortalLayout({
  user,
  title,
  subtitle,
  actions,
  children,
  onLogout: _onLogout,
}: {
  user: PortalUser;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  onLogout?: () => void;
}) {
  const { choice, setChoice } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const role = user.role as PortalRole;
  const isOperator = isPortalOperator(role);
  const isAdmin = isPortalAdmin(role);
  const notifications = trpc.messages.notifications.useQuery(undefined, { refetchInterval: 15_000 });
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation();
  const unreadCount = notifications.data?.length ?? 0;

  // Um caminhão parado no portão espera a Operação aceitar o recebimento, e
  // quem decide não fica com a tela do pátio aberta o dia inteiro. Por isso a
  // solicitação de liberação avisa em todas as telas do portal, e não só lá.
  const canApproveEntries = isPortalYard(role);
  const releaseRequests = trpc.attendances.list.useQuery(
    { status: "aguardando" },
    { enabled: canApproveEntries, refetchInterval: 15_000 }
  );
  const pendingReleases = canApproveEntries ? (releaseRequests.data ?? []) : [];
  // Quem trata o backlog precisa saber que ele encheu sem abrir a tela.
  const podeTratarBacklog = canTreatBacklogPortal(role);
  const backlogFila = trpc.appointments.list.useQuery({ status: "backlog" }, { enabled: podeTratarBacklog, refetchInterval: 60_000 });
  const backlogCount = podeTratarBacklog ? (backlogFila.data?.length ?? 0) : 0;
  const releaseCount = pendingReleases.length;
  const alertCount = unreadCount + releaseCount;

  // Cada perfil vê só o seu posto de trabalho: quem cuida de agendamentos não
  // tem o pátio no menu, e quem trabalha no portão não tem a agenda. O
  // administrador é o único que enxerga tudo. Itens de administração ficam no
  // menu da conta, sem competir com a operação do dia na barra principal.
  const schedulingNav: NavItem[] = [
    { label: "Dashboard", path: "/operador/dashboard", icon: LayoutDashboard },
    { label: "Agendamentos", path: "/operador", icon: ClipboardList },
    { label: "Calendário", path: "/operador/calendario", icon: CalendarDays },
    // Relatórios abre um menu: são duas consultas diferentes, e a de backlog
    // não é uma aba dentro da outra — tem período, colunas e público próprios.
    {
      label: "Relatórios",
      path: "/operador/relatorios",
      icon: BarChart3,
      grupo: "Movimentação",
      filhos: [
        { label: "Notas lançadas", path: "/operador/relatorios" },
        { label: "Backlog", path: "/operador/relatorios/backlog" },
      ],
    },
  ];
  // O backlog é a fila de tratativa do planejamento. Fica fora do menu do
  // Operador de propósito: é ele quem manda a nota para lá.
  const backlogNav: NavItem[] = [{ label: "Backlog", path: "/operador/backlog", icon: AlertTriangle, badge: backlogCount }];
  const gateNav: NavItem[] = [{ label: "Portaria", path: "/portaria", icon: DoorOpen }];
  const yardNav: NavItem[] = [{ label: "Operação", path: "/operacao", icon: PackageCheck, badge: releaseCount }];
  // Para quem enxerga mais de uma tela do pátio, elas entram num menu só. Oito
  // itens soltos na barra atropelavam o nome de quem está logado, e quem precisa
  // do pátio o dia inteiro é a Portaria e a Operação — que continuam com a sua
  // tela direto, sem menu nenhum.
  const patioFilhos = [
    ...(isAdmin || isPortalGate(role) ? [{ label: "Portaria", path: "/portaria" }] : []),
    ...(isPortalYard(role) ? [{ label: "Operação", path: "/operacao" }] : []),
    ...(canSeeGateHistory(role) ? [{ label: "Histórico", path: "/portaria/historico" }] : []),
  ];
  const patioNav: NavItem[] = patioFilhos.length
    ? [{ label: "Pátio", path: patioFilhos[0].path, icon: PackageCheck, badge: releaseCount, filhos: patioFilhos }]
    : [];

  // O planejador para na agenda: as quatro telas de planejamento e nada do
  // pátio. É o recorte inteiro do perfil.
  const nav: NavItem[] = isAdmin
    ? [...schedulingNav, ...backlogNav, ...patioNav]
    : isOperator
      ? [...schedulingNav, ...patioNav]
      : isPortalPlanner(role)
        ? [...schedulingNav, ...backlogNav]
        : // A Portaria tem uma tela só: quem está no portão não navega pelo
          // sistema no meio do turno.
          isPortalGate(role)
          ? gateNav
          : // A Operação também: a doca é uma tela só, como o portão.
            isPortalYard(role)
            ? yardNav
            : [{ label: "Meus agendamentos", path: "/fornecedor", icon: ClipboardList }];

  const adminNav: NavItem[] = isAdmin
    ? [
        { label: "Acessos", path: "/operador/acessos", icon: UserCheck },
        { label: "Administrar notas", path: "/operador/notas", icon: ShieldCheck },
        { label: "Importar acervo", path: "/operador/importar", icon: DatabaseBackup },
      ]
    : [];

  // Só avisa o que chegou depois de a tela abrir: sem isso, entrar no portal
  // com a fila cheia dispararia um aviso de "novidade" que não é novidade.
  const seenReleases = useRef<number | null>(null);
  useEffect(() => {
    if (!canApproveEntries || !releaseRequests.data) return;
    const previous = seenReleases.current;
    seenReleases.current = releaseCount;
    if (previous === null || releaseCount <= previous) return;
    toast.info("Nova solicitação de liberação", {
      description: `${releaseCount} caminhão(ões) no portão esperando o aceite da Operação.`,
      action: { label: "Ver", onClick: () => setLocation("/operacao") },
    });
  }, [canApproveEntries, releaseRequests.data, releaseCount, setLocation]);

  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const homePath = nav[0]?.path ?? "/";
  const go = (path: string) => {
    setLocation(path);
    setMenuAberto(null);
    setMobileOpen(false);
    setProfileOpen(false);
  };

  const finishLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      try {
        sessionStorage.removeItem("manus-cookie");
        localStorage.removeItem("manus-runtime-user-info");
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      setProfileOpen(false);
      setLocation("/");
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-5 sm:px-8">
          <button onClick={() => go(homePath)} className="flex shrink-0 items-center gap-2.5 text-left">
            <img src="/RVD-Saude.png" alt="RVD Saúde" className="size-9 rounded-xl object-cover" />
            <span className="hidden min-w-0 sm:block">
              <span className="block font-display text-sm font-extrabold leading-none text-rvd-plum">RVD Saúde</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                Portal operacional
              </span>
            </span>
          </button>

          <nav className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
            <div className="flex items-center">
              {nav.map(item => {
                const active = item.filhos ? item.filhos.some(filho => location === filho.path) : location === item.path;
                const Icon = item.icon;
                if (item.filhos) {
                  const aberto = menuAberto === item.path;
                  return (
                    <div key={item.path} className="relative">
                      <button
                        onClick={() => setMenuAberto(atual => (atual === item.path ? null : item.path))}
                        aria-expanded={aberto}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold transition ${
                          active ? "bg-rvd-plum-pale/50 text-rvd-plum" : "text-ink-soft hover:bg-canvas hover:text-ink"
                        }`}
                      >
                        <Icon className="size-4" />
                        {item.label}
                        {item.badge ? (
                          <span className="flex min-w-[18px] items-center justify-center rounded-full bg-state-stop px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                            {item.badge > 9 ? "9+" : item.badge}
                          </span>
                        ) : null}
                        <ChevronDown className={`size-3.5 transition ${aberto ? "rotate-180" : ""}`} />
                      </button>
                      {aberto && (
                        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-line bg-surface p-2 shadow-xl">
                          {item.grupo && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">{item.grupo}</p>}
                          {item.filhos.map(filho => (
                            <button
                              key={filho.path}
                              onClick={() => { setMenuAberto(null); go(filho.path); }}
                              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-bold transition ${
                                location === filho.path ? "bg-rvd-plum-pale/50 text-rvd-plum" : "text-ink-soft hover:bg-canvas hover:text-ink"
                              }`}
                            >
                              {filho.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold transition ${
                      active ? "bg-rvd-plum-pale/50 text-rvd-plum" : "text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                    {item.badge ? (
                      <span className="flex min-w-[18px] items-center justify-center rounded-full bg-state-stop px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setMobileOpen(value => !value)}
              className="rounded-lg border border-line p-2 text-ink-soft xl:hidden"
              aria-label="Abrir navegação"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <button
              onClick={() => {
                setNotificationsOpen(value => !value);
                setProfileOpen(false);
              }}
              title={releaseCount > 0 ? "Solicitações de liberação e mensagens" : "Mensagens novas"}
              className="relative hidden rounded-lg p-2.5 text-ink-soft hover:bg-canvas hover:text-ink sm:block"
            >
              <Bell className="size-5" />
              {alertCount > 0 && (
                <span
                  className={`absolute -right-0.5 -top-0.5 flex size-4.5 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white ${
                    releaseCount > 0 ? "bg-state-stop" : "bg-brand"
                  }`}
                >
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setProfileOpen(value => !value);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-canvas"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-rvd-plum-pale/60 text-rvd-plum">
                <UserRound className="size-4" />
              </span>
              <span className="hidden max-w-24 sm:block 2xl:max-w-36">
                <span className="block truncate text-sm font-bold text-ink">{user.name || "Acesso RVD"}</span>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                  {roleLabel[role]}
                </span>
              </span>
              <ChevronDown className="mr-1 hidden size-4 text-ink-faint sm:block" />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-line bg-surface px-5 py-3 xl:hidden">
            <nav className="flex flex-wrap gap-2">
              {[...nav, ...adminNav].flatMap(item => (item.filhos ? item.filhos.map(filho => ({ ...item, label: filho.label, path: filho.path, filhos: undefined })) : [item])).map(item => {
                const Icon = item.icon;
                const active = location === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
                      active ? "bg-brand text-white" : "bg-canvas text-ink-soft"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                    {item.badge ? (
                      <span className="flex min-w-[18px] items-center justify-center rounded-full bg-state-stop px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        {notificationsOpen && (
          <div className="absolute right-5 top-[4.25rem] z-50 w-[min(24rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-lg sm:right-8">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="font-display text-sm font-extrabold text-ink">Avisos</p>
                <p className="text-xs text-ink-soft">
                  {releaseCount > 0 ? "Liberações no portão e conversas das notas" : "Conversas vinculadas às notas"}
                </p>
              </div>
              <Bell className="size-4 text-ink-faint" />
            </div>
            {releaseCount > 0 && (
              <div className="border-b border-line bg-state-stop-bg/50 p-2">
                <p className="px-2 pb-1 pt-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-state-stop">
                  Solicitações de liberação · {releaseCount}
                </p>
                <div className="max-h-56 overflow-y-auto">
                  {pendingReleases.map(request => (
                    <button
                      key={request.id}
                      onClick={() => {
                        setNotificationsOpen(false);
                        go("/operacao");
                      }}
                      className="w-full rounded-xl p-3 text-left hover:bg-surface"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 rounded-lg bg-state-stop-bg p-2 text-state-stop">
                          <Truck className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-mono text-xs font-bold text-ink">{request.licensePlate}</span>
                          <span className="mt-0.5 block truncate text-sm text-ink-soft">
                            {request.supplierName ?? serviceTypeCopy[request.serviceType]} · aguardando aceite
                          </span>
                          <span className="mt-1 block text-[10px] text-ink-faint">
                            Chegou{" "}
                            {new Date(request.arrivalAt).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {notifications.data?.length ? (
              <div className="max-h-80 overflow-y-auto p-2">
                {notifications.data.map(message => (
                  <button
                    key={message.id}
                    onClick={() => {
                      setNotificationsOpen(false);
                      go(`${isOperator ? "/operador" : "/fornecedor"}?chat=${message.appointmentId}`);
                    }}
                    className="w-full rounded-xl p-3 text-left hover:bg-canvas"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-lg bg-rvd-plum-pale/60 p-2 text-rvd-plum">
                        <MessageCircle className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-ink">
                          {message.invoiceNumber ? `Nota ${message.invoiceNumber}` : message.serviceType}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-ink-soft">
                          {message.senderName || "Participante"}: {message.body}
                        </span>
                        <span className="mt-1 block text-[10px] text-ink-faint">
                          {new Date(message.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              releaseCount === 0 && (
                <div className="px-5 py-10 text-center">
                  <Bell className="mx-auto size-6 text-ink-faint" />
                  <p className="mt-3 text-sm font-bold text-ink">Nenhum aviso novo</p>
                </div>
              )
            )}
          </div>
        )}

        {profileOpen && (
          <div className="absolute right-5 top-[4.25rem] w-72 rounded-2xl border border-line bg-surface p-4 shadow-lg sm:right-8">
            <p className="truncate font-display text-sm font-extrabold text-ink">{user.name || "Acesso RVD"}</p>
            <p className="mt-1 truncate text-xs text-ink-soft">{user.email}</p>
            <p className="mt-3 inline-flex rounded-full bg-rvd-plum-pale/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rvd-plum">
              {roleLabel[role]}
            </p>
            {adminNav.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="eyebrow">Administração</p>
                {adminNav.map(item => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.path}
                      onClick={() => go(item.path)}
                      variant="ghost"
                      className="mt-1 w-full justify-start text-ink-soft hover:bg-canvas hover:text-ink"
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            )}
            <div className="mt-4 border-t border-line pt-3">
              <p className="eyebrow">Tema</p>
              <div className="mt-2 flex gap-1 rounded-xl bg-canvas p-1">
                {themeOptions.map(option => {
                  const Icon = option.icon;
                  const active = choice === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setChoice(option.value)}
                      aria-pressed={active}
                      title={option.label}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                        active ? "bg-surface text-rvd-plum shadow-sm" : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <Button
                onClick={() => {
                  setProfileOpen(false);
                  setNameOpen(true);
                }}
                variant="ghost"
                className="w-full justify-start text-ink-soft hover:bg-canvas hover:text-ink"
              >
                <UserRound className="size-4" />
                Alterar nome
              </Button>
              <Button
                onClick={() => {
                  setProfileOpen(false);
                  setPasswordOpen(true);
                }}
                variant="ghost"
                className="mt-1 w-full justify-start text-ink-soft hover:bg-canvas hover:text-ink"
              >
                <KeyRound className="size-4" />
                Alterar senha
              </Button>
              <Button
                onClick={finishLogout}
                disabled={logoutMutation.isPending}
                variant="ghost"
                className="mt-1 w-full justify-start text-state-stop hover:bg-state-stop-bg hover:text-state-stop"
              >
                <LogOut className="size-4" />
                {logoutMutation.isPending ? "Encerrando..." : "Encerrar sessão"}
              </Button>
            </div>
          </div>
        )}
      </header>

      <main>
        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
              <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{subtitle}</p>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          <div>{children}</div>
        </div>
      </main>
      <ChangeNameDialog open={nameOpen} onOpenChange={setNameOpen} currentName={user.name ?? ""} />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
