import { Button } from "@/components/ui/button";
import { type PortalRole, isPortalAdmin, isPortalOperator } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { BarChart3, Bell, CalendarDays, ChevronDown, ClipboardList, LayoutDashboard, KeyRound, LogOut, Menu, UserCheck, MessageCircle, ShieldCheck, UserRound, X } from "lucide-react";
import { useState } from "react";
import ChangePasswordDialog from "../components/ChangePasswordDialog";
import { useLocation } from "wouter";

type PortalUser = { id: number; name: string | null; email: string | null; role: string };

export default function PortalLayout({ user, title, subtitle, children, onLogout: _onLogout }: { user: PortalUser; title: string; subtitle: string; children: React.ReactNode; onLogout?: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const role = user.role as PortalRole;
  const isOperator = isPortalOperator(role);
  const isAdmin = isPortalAdmin(role);
  const notifications = trpc.messages.notifications.useQuery(undefined, { refetchInterval: 15_000 });
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation();
  const unreadCount = notifications.data?.length ?? 0;
  const nav = isOperator
    ? [
      { label: "Dashboard", path: "/operador/dashboard", icon: LayoutDashboard },
      { label: "Agendamentos", path: "/operador", icon: ClipboardList },
      { label: "Calendário", path: "/operador/calendario", icon: CalendarDays },
      { label: "Relatórios", path: "/operador/relatorios", icon: BarChart3 },
      { label: "Acessos", path: "/operador/acessos", icon: UserCheck },
      ...(isAdmin ? [{ label: "Administrar notas", path: "/operador/notas", icon: ShieldCheck }] : []),
    ]
    : [{ label: "Meus agendamentos", path: "/fornecedor", icon: ClipboardList }];
  const go = (path: string) => { setLocation(path); setMobileOpen(false); };
  const finishLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      try { sessionStorage.removeItem("manus-cookie"); localStorage.removeItem("manus-runtime-user-info"); } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      setProfileOpen(false);
      setLocation("/");
    }
  };
  const roleLabel = isAdmin ? "Administrador" : isOperator ? "Operador" : "Fornecedor";

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 border-b border-rvd-plum-soft bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-24 max-w-[1440px] items-center gap-4 px-5 sm:px-8">
          <button onClick={() => go(isOperator ? "/operador/dashboard" : "/fornecedor")} className="flex shrink-0 items-center gap-3 text-left">
            <img src="/RVD-Saude.png" alt="RVD Saúde" className="size-11 rounded-2xl object-cover shadow-sm" />
            <div className="hidden min-w-0 sm:block">
              <p className="font-display text-base font-extrabold leading-none text-rvd-plum">RVD Saúde</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-rvd-plum">Sistema de Agendamento</p>
            </div>
          </button>

          <nav className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
            <div className="flex items-center gap-1 rounded-2xl bg-rvd-plum-pale p-1.5">
              {nav.map(item => {
                const active = location === item.path || (item.path === "/operador" && location === "/operador");
                const Icon = item.icon;
                return <button key={item.path} onClick={() => go(item.path)} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${active ? "bg-white text-rvd-plum shadow-sm" : "text-rvd-plum hover:bg-white/70"}`}><Icon className="size-4" />{item.label}</button>;
              })}
            </div>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button onClick={() => setMobileOpen(value => !value)} className="rounded-xl border border-rvd-plum-soft p-2 text-rvd-plum lg:hidden" aria-label="Abrir navegação">
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <button onClick={() => { setNotificationsOpen(value => !value); setProfileOpen(false); }} title="Mensagens novas" className="relative hidden rounded-xl p-2.5 text-rvd-plum hover:bg-rvd-plum-pale sm:block">
              <Bell className="size-5" />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-rvd-plum text-[10px] font-extrabold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
            <button onClick={() => { setProfileOpen(value => !value); setNotificationsOpen(false); }} className="flex items-center gap-2 rounded-xl border border-rvd-plum-soft p-1.5 text-left hover:bg-rvd-plum-pale">
              <span className="flex size-9 items-center justify-center rounded-lg bg-rvd-blue text-rvd-plum"><UserRound className="size-5" /></span>
              <span className="hidden max-w-36 sm:block">
                <span className="block truncate text-sm font-bold text-rvd-plum">{user.name || "Acesso RVD"}</span>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{roleLabel}</span>
              </span>
              <ChevronDown className="mr-1 hidden size-4 text-rvd-plum sm:block" />
            </button>
          </div>
        </div>

        {mobileOpen && <div className="border-t border-rvd-plum-soft bg-white px-5 py-3 lg:hidden"><nav className="flex flex-wrap gap-2">{nav.map(item => { const Icon = item.icon; const active = location === item.path; return <button key={item.path} onClick={() => go(item.path)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${active ? "bg-rvd-plum text-white" : "bg-rvd-plum-pale text-rvd-plum"}`}><Icon className="size-4" />{item.label}</button>; })}</nav></div>}

        {notificationsOpen && <div className="absolute right-5 top-[5.5rem] z-50 w-[min(24rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-rvd-plum-soft bg-white shadow-xl sm:right-8">
          <div className="flex items-center justify-between border-b border-rvd-plum-soft px-4 py-3"><div><p className="font-display text-sm font-extrabold text-rvd-plum">Mensagens novas</p><p className="text-xs text-rvd-plum">Conversas vinculadas às notas</p></div><Bell className="size-4 text-rvd-plum" /></div>
          {notifications.data?.length ? <div className="max-h-80 overflow-y-auto p-2">{notifications.data.map(message => <button key={message.id} onClick={() => { setNotificationsOpen(false); go(`${isOperator ? "/operador" : "/fornecedor"}?chat=${message.appointmentId}`); }} className="w-full rounded-xl p-3 text-left hover:bg-rvd-plum-pale"><div className="flex items-start gap-3"><span className="mt-0.5 rounded-lg bg-rvd-plum-pale p-2 text-rvd-plum"><MessageCircle className="size-4" /></span><span className="min-w-0"><span className="block text-xs font-bold text-rvd-plum">{message.invoiceNumber ? `Nota ${message.invoiceNumber}` : message.serviceType}</span><span className="mt-0.5 block truncate text-sm text-rvd-plum">{message.senderName || "Participante"}: {message.body}</span><span className="mt-1 block text-[10px] text-rvd-plum">{new Date(message.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span></span></div></button>)}</div> : <div className="px-5 py-10 text-center"><Bell className="mx-auto size-6 text-rvd-plum" /><p className="mt-3 font-bold text-rvd-plum">Nenhuma mensagem nova</p></div>}
        </div>}

        {profileOpen && <div className="absolute right-5 top-[5.5rem] w-72 rounded-2xl border border-rvd-plum-soft bg-white p-4 shadow-xl sm:right-8"><p className="truncate font-display text-sm font-extrabold text-rvd-plum">{user.name || "Acesso RVD"}</p><p className="mt-1 truncate text-xs text-rvd-plum">{user.email}</p><p className="mt-3 inline-flex rounded-full bg-rvd-plum-pale px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{roleLabel}</p><Button onClick={() => { setProfileOpen(false); setPasswordOpen(true); }} variant="ghost" className="mt-4 w-full justify-start text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><KeyRound className="size-4" />Alterar senha</Button><Button onClick={finishLogout} disabled={logoutMutation.isPending} variant="ghost" className="mt-1 w-full justify-start text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><LogOut className="size-4" />{logoutMutation.isPending ? "Encerrando..." : "Encerrar sessão"}</Button></div>}
      </header>

      <main>
        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-2 border-b border-rvd-plum-soft pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-rvd-plum sm:text-3xl">{title}</h1>
              <p className="mt-1 text-sm text-rvd-plum">{subtitle}</p>
            </div>
          </div>
          <div className="pt-7">{children}</div>
        </div>
      </main>
    <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} /></div>
  );
}
