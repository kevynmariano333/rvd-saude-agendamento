import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatCnpj, roleLabel, type PortalRole, homePathFor } from "@/lib/portal";
import { Ban, CheckCircle2, ShieldCheck, UserCheck, UsersRound, X } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

type PendingRequest = {
  id: number;
  name: string | null;
  email: string | null;
  role: PortalRole;
  companyName: string | null;
  companyCnpj: string | null;
};

/** Perfis internos que o administrador pode atribuir a uma conta já existente. */
const assignableRoles = ["admin", "operator", "portaria"] as const;

export default function AccessRequests() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const isAdmin = auth.data?.role === "admin";
  const pending = trpc.accessRequests.listPending.useQuery(undefined, { enabled: isAdmin });
  const staff = trpc.staff.list.useQuery(undefined, { enabled: isAdmin });

  const decide = trpc.accessRequests.decide.useMutation({
    onSuccess: (_result, variables) => {
      toast.success(variables.approve ? "Acesso liberado." : "Acesso recusado.");
      utils.accessRequests.listPending.invalidate();
      utils.staff.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const setRole = trpc.staff.setRole.useMutation({
    onSuccess: () => {
      toast.success("Perfil atualizado.");
      utils.staff.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const setAccess = trpc.staff.setAccess.useMutation({
    onSuccess: (_result, variables) => {
      toast.success(variables.allowed ? "Acesso liberado." : "Acesso bloqueado. A conta não entra mais no sistema.");
      utils.staff.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data && auth.data.role !== "admin") {
      setLocation(homePathFor(auth.data.role as PortalRole));
    }
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  if (!auth.data || !isAdmin) return <div className="min-h-screen bg-canvas" />;

  const requests = pending.data ?? [];
  const team = staff.data ?? [];

  return (
    <PortalLayout
      user={auth.data}
      title="Acessos ao sistema"
      subtitle="Todo cadastro novo passa por aqui antes de ter acesso, e é aqui que os perfis internos são definidos."
    >
      <div className="space-y-6">
        <Panel>
          <PanelHeader
            eyebrow="Aprovação"
            title="Solicitações pendentes"
            description="Nenhum cadastro entra sozinho: a conta fica sem acesso até você aprovar."
            icon={ShieldCheck}
            actions={
              <span className="rounded-lg bg-canvas px-3 py-1.5 font-display text-lg font-extrabold tabular-nums text-ink">
                {requests.length}
              </span>
            }
          />
          {pending.isLoading ? (
            <PanelBody>
              <p className="text-sm text-ink-soft">Carregando solicitações...</p>
            </PanelBody>
          ) : requests.length ? (
            <ul className="divide-y divide-line">
              {requests.map((request: PendingRequest) => (
                <li key={request.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <p className="font-display text-base font-extrabold text-ink">
                      {request.companyName || request.name || "Novo acesso"}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">{request.email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-rvd-plum-pale/60 px-2.5 py-1 text-[11px] font-bold text-rvd-plum">
                        {roleLabel[request.role]}
                      </span>
                      {request.companyCnpj && (
                        <span className="text-xs text-ink-faint">CNPJ {formatCnpj(request.companyCnpj)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      onClick={() => decide.mutate({ userId: request.id, approve: false })}
                      disabled={decide.isPending}
                      variant="outline"
                      className="h-10 rounded-xl border-line px-4 text-xs font-bold text-state-stop hover:bg-state-stop-bg"
                    >
                      <X className="size-4" />
                      Recusar
                    </Button>
                    <Button
                      onClick={() => decide.mutate({ userId: request.id, approve: true })}
                      disabled={decide.isPending}
                      className="h-10 rounded-xl bg-rvd-plum px-4 text-xs font-bold text-white hover:bg-rvd-plum/90"
                    >
                      <UserCheck className="size-4" />
                      Aprovar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Nenhuma solicitação pendente"
              description="Quando alguém pedir acesso ao sistema, o pedido aparece aqui para sua decisão."
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Equipe interna"
            title="Perfis de acesso"
            description="Defina o perfil de cada conta e bloqueie quem não deve mais entrar. Uma conta bloqueada continua no histórico, mas não acessa o sistema."
            icon={UsersRound}
          />
          {staff.isLoading ? (
            <PanelBody>
              <p className="text-sm text-ink-soft">Carregando equipe...</p>
            </PanelBody>
          ) : team.length ? (
            <ul className="divide-y divide-line">
              {team.map(member => {
                const blocked = member.accessStatus === "rejected";
                return (
                <li key={member.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">
                      {member.name || "Conta sem nome"}
                      {member.id === auth.data?.id && <span className="ml-2 text-xs font-bold text-ink-faint">(você)</span>}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-ink-soft">{member.email || "E-mail não informado"}</p>
                    {member.accessStatus !== "approved" && (
                      <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${blocked ? "bg-state-stop-bg text-state-stop" : "bg-state-wait-bg text-state-wait"}`}>
                        {member.accessStatus === "pending" ? "Aguardando aprovação" : "Bloqueado — não entra no sistema"}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1 rounded-xl bg-canvas p-1">
                      {assignableRoles.map(option => {
                        const active = member.role === option;
                        return (
                          <button
                            key={option}
                            onClick={() => setRole.mutate({ userId: member.id, role: option })}
                            disabled={setRole.isPending || active || member.id === auth.data?.id}
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed ${
                              active ? "bg-surface text-rvd-plum shadow-sm" : "text-ink-soft hover:text-ink"
                            }`}
                          >
                            {roleLabel[option]}
                          </button>
                        );
                      })}
                    </div>
                    {blocked ? (
                      <Button
                        onClick={() => setAccess.mutate({ userId: member.id, allowed: true })}
                        disabled={setAccess.isPending}
                        variant="outline"
                        className="h-9 rounded-xl border-line px-3.5 text-xs font-bold text-state-go hover:bg-state-go-bg"
                      >
                        <ShieldCheck className="size-4" />
                        Liberar
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setAccess.mutate({ userId: member.id, allowed: false })}
                        disabled={setAccess.isPending}
                        variant="outline"
                        className="h-9 rounded-xl border-line px-3.5 text-xs font-bold text-state-stop hover:bg-state-stop-bg"
                      >
                        <Ban className="size-4" />
                        Bloquear
                      </Button>
                    )}
                  </div>
                </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={UsersRound}
              title="Nenhuma conta interna"
              description="Operadores, portaria e operação aparecem aqui depois do primeiro cadastro."
            />
          )}
        </Panel>
      </div>
    </PortalLayout>
  );
}
