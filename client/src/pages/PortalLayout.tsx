import { Button } from "@/components/ui/button";
import { type PortalRole, isPortalOperator } from "@/lib/portal";
import { CalendarDays, ClipboardList, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

type PortalUser = { id: number; name: string | null; email: string | null; role: string };

export default function PortalLayout({
  user,
  title,
  subtitle,
  children,
  onLogout,
}: {
  user: PortalUser;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const role = user.role as PortalRole;
  const isOperator = isPortalOperator(role);
  const nav = isOperator
    ? [{ label: "Agendamentos", path: "/operador", icon: ClipboardList }]
    : [{ label: "Meus agendamentos", path: "/fornecedor", icon: CalendarDays }];

  return (
    <div className="min-h-screen bg-white">
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-rvd-plum-soft bg-white px-5 py-6 transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="flex items-center justify-between gap-3 border-b border-rvd-plum-soft pb-6">
          <button onClick={() => setLocation(isOperator ? "/operador" : "/fornecedor")} className="flex min-w-0 items-center gap-3 text-left">
            <img src="/manus-storage/RVD-Saude_f78a565b.png" alt="RVD Saúde" className="h-11 w-11 rounded-full object-cover" />
            <div className="min-w-0">
              <p className="font-display text-sm font-extrabold leading-none text-rvd-plum">RVD Saúde</p>
              <p className="mt-1 text-xs font-medium text-rvd-plum">Agendamento</p>
            </div>
          </button>
          <button onClick={() => setOpen(false)} className="rounded-xl p-2 text-rvd-plum lg:hidden" aria-label="Fechar menu"><X className="size-5" /></button>
        </div>

        <p className="mt-8 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-rvd-plum">Navegação</p>
        <nav className="mt-3 space-y-1">
          {nav.map(item => {
            const active = location === item.path;
            return <button key={item.path} onClick={() => { setLocation(item.path); setOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active ? "bg-rvd-plum text-white" : "text-rvd-plum hover:bg-rvd-plum-pale"}`}>
              <item.icon className="size-4" />{item.label}
            </button>;
          })}
        </nav>

        <div className="mt-auto rounded-2xl bg-rvd-blue-pale p-4">
          <p className="truncate text-sm font-bold text-rvd-plum">{user.name || "Acesso RVD"}</p>
          <p className="mt-1 truncate text-xs text-rvd-plum">{user.email}</p>
          <p className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-rvd-plum">{isOperator ? "Operador" : "Fornecedor"}</p>
          <Button onClick={onLogout} variant="ghost" className="mt-4 h-auto w-full justify-start gap-2 px-0 py-1 text-rvd-plum hover:bg-transparent hover:text-rvd-plum"><LogOut className="size-4" />Encerrar sessão</Button>
        </div>
      </aside>

      {open && <button className="fixed inset-0 z-40 bg-rvd-plum/30 lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar navegação" />}
      <main className="min-h-screen lg:pl-72">
        <header className="flex min-h-24 items-center justify-between border-b border-rvd-plum-soft px-5 py-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="rounded-xl border border-rvd-plum-soft p-2 text-rvd-plum lg:hidden" aria-label="Abrir menu"><Menu className="size-5" /></button>
            <div><h1 className="font-display text-xl font-extrabold tracking-tight text-rvd-plum sm:text-2xl">{title}</h1><p className="mt-1 text-sm text-rvd-plum">{subtitle}</p></div>
          </div>
          <div className="hidden rounded-full bg-rvd-plum-pale px-4 py-2 text-xs font-bold text-rvd-plum sm:block">RVD Saúde Agendamento</div>
        </header>
        <div className="mx-auto max-w-7xl p-5 sm:p-8 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
