import { Button } from "@/components/ui/button";
import { isPortalAdmin, isPortalGate, isPortalOperator, isPortalYard, roleLabel, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import {
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
  PackageCheck,
  ShieldCheck,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import ChangeNameDialog from "../components/ChangeNameDialog";
import ChangePasswordDialog from "../components/ChangePasswordDialog";
import { useLocation } from "wouter";

type PortalUser = { id: number; name: string | null; email: string | null; role: string };

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

  // Cada perfil vê só o seu posto de trabalho: quem cuida de agendamentos não
  // tem o pátio no menu, e quem trabalha no portão não tem a agenda. O
  // administrador é o único que enxerga tudo. Itens de administração ficam no
  // menu da conta, sem competir com a operação do dia na barra principal.
  const schedulingNav = [
    { label: "Dashboard", path: "/operador/dashboard", icon: LayoutDashboard },
    { label: "Agendamentos", path: "/operador", icon: ClipboardList },
    { label: "Calendário", path: "/operador/calendario", icon: CalendarDays },
    { label: "Relatórios", path: "/operador/relatorios", icon: BarChart3 },
  ];
  const gateNav = [{ label: "Portaria", path: "/portaria", icon: DoorOpen }];
  const yardNav = [{ label: "Operação", path: "/operacao", icon: PackageCheck }];

  const nav = isAdmin
    ? [...schedulingNav, ...gateNav, ...yardNav]
    : isOperator
      ? [...schedulingNav, ...yardNav]
      : isPortalGate(role)
        ? gateNav
        : isPortalYard(role)
          ? yardNav
          : [{ label: "Meus agendamentos", path: "/fornecedor", icon: ClipboardList }];

  const adminNav = isAdmin
    ? [
        { label: "Acessos", path: "/operador/acessos", icon: UserCheck },
        { label: "Administrar notas", path: "/operador/notas", icon: ShieldCheck },
      ]
    : [];

  const homePath = nav[0]?.path ?? "/";
  const go = (path: string) => {
    setLocation(path);
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

          <nav className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
            <div className="flex items-center gap-0.5">
              {nav.map(item => {
                const active = location === item.path;
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
                      active ? "bg-rvd-plum-pale/50 text-rvd-plum" : "text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setMobileOpen(value => !value)}
              className="rounded-lg border border-line p-2 text-ink-soft lg:hidden"
              aria-label="Abrir navegação"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <button
              onClick={() => {
                setNotificationsOpen(value => !value);
                setProfileOpen(false);
              }}
              title="Mensagens novas"
              className="relative hidden rounded-lg p-2.5 text-ink-soft hover:bg-canvas hover:text-ink sm:block"
            >
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4.5 min-w-[18px] items-center justify-center rounded-full bg-rvd-plum px-1 text-[10px] font-extrabold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
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
              <span className="hidden max-w-36 sm:block">
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
          <div className="border-t border-line bg-surface px-5 py-3 lg:hidden">
            <nav className="flex flex-wrap gap-2">
              {[...nav, ...adminNav].map(item => {
                const Icon = item.icon;
                const active = location === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
                      active ? "bg-rvd-plum text-white" : "bg-canvas text-ink-soft"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
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
                <p className="font-display text-sm font-extrabold text-ink">Mensagens novas</p>
                <p className="text-xs text-ink-soft">Conversas vinculadas às notas</p>
              </div>
              <Bell className="size-4 text-ink-faint" />
            </div>
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
              <div className="px-5 py-10 text-center">
                <Bell className="mx-auto size-6 text-ink-faint" />
                <p className="mt-3 text-sm font-bold text-ink">Nenhuma mensagem nova</p>
              </div>
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
