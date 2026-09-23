import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatCnpj, roleLabel, type PortalRole, homePathFor } from "@/lib/portal";
import { Ban, Building2, CheckCircle2, Search, ShieldCheck, UserCheck, UsersRound, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatarCnpj } from "@shared/recipients";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";
import BackupCard from "../components/BackupCard";
import EstadoDoSistemaCard from "../components/EstadoDoSistemaCard";

type PendingRequest = {
  id: number;
  name: string | null;
  email: string | null;
  role: PortalRole;
  companyName: string | null;
  companyCnpj: string | null;
};

/** Perfis internos que o administrador pode atribuir a uma conta já existente. */
const assignableRoles = ["admin", "operator", "planejador", "portaria"] as const;

export default function AccessRequests() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const isAdmin = auth.data?.role === "admin";
  const pending = trpc.accessRequests.listPending.useQuery(undefined, { enabled: isAdmin });
  const staff = trpc.staff.list.useQuery(undefined, { enabled: isAdmin });
  const fornecedores = trpc.staff.fornecedores.useQuery(undefined, { enabled: isAdmin });
  const [buscaDeFornecedor, setBuscaDeFornecedor] = useState("");

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
      utils.staff.fornecedores.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  /**
   * A equipe interna, separada por perfil.
   *
   * Numa lista só, achar o planejador no meio dos operadores era ler linha por
   * linha. A ordem é a da hierarquia de acesso — de quem vê tudo a quem vê uma
   * tela — e perfil sem ninguém não vira cabeçalho vazio.
   */
  const equipePorPerfil = useMemo(() => {
    const ordem: PortalRole[] = ["admin", "operator", "planejador", "portaria", "operacao"];
    const contas = staff.data ?? [];
    return ordem
      .map(perfil => ({ perfil, contas: contas.filter(conta => conta.role === perfil && conta.accessStatus !== "rejected") }))
      .filter(grupo => grupo.contas.length > 0);
  }, [staff.data]);
  /**
   * As contas bloqueadas, num lugar só.
   *
   * Espalhadas pelos perfis, elas engordavam listas de gente que trabalha com
   * gente que não entra mais. Juntas, viram o que de fato são: uma lista para
   * revisar de vez em quando, e de onde se libera quem voltou.
   */
  const bloqueados = useMemo(() => [
    ...(staff.data ?? []).filter(conta => conta.accessStatus === "rejected").map(conta => ({ id: conta.id, nome: conta.name, email: conta.email, detalhe: roleLabel[conta.role as PortalRole] })),
    ...(fornecedores.data ?? []).filter(conta => conta.accessStatus === "rejected").map(conta => ({ id: conta.id, nome: conta.companyName || conta.name, email: conta.email, detalhe: conta.companyCnpj ? `Fornecedor · ${formatarCnpj(conta.companyCnpj)}` : "Fornecedor" })),
  ], [fornecedores.data, staff.data]);
  const fornecedoresFiltrados = useMemo(() => {
    const texto = buscaDeFornecedor.trim().toLowerCase();
    const digitos = texto.replace(/\D/g, "");
    return (fornecedores.data ?? []).filter(conta => conta.accessStatus !== "rejected").filter(conta => {
      if (!texto) return true;
      const alvo = `${conta.companyName ?? ""} ${conta.name ?? ""} ${conta.email ?? ""}`.toLowerCase();
      return alvo.includes(texto) || (digitos.length > 0 && (conta.companyCnpj ?? "").includes(digitos));
    });
  }, [buscaDeFornecedor, fornecedores.data]);

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
                      className="h-10 rounded-xl bg-brand px-4 text-xs font-bold text-white hover:bg-brand/90"
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
          ) : equipePorPerfil.length ? (
            <ul className="divide-y divide-line">
              {equipePorPerfil.flatMap(grupo => [
                <li key={`cabecalho-${grupo.perfil}`} className="bg-sunken px-5 py-2 sm:px-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">{roleLabel[grupo.perfil]} · {grupo.contas.length}</p>
                </li>,
                ...grupo.contas.map(member => {
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
                }),
              ])}
            </ul>
          ) : (
            <EmptyState
              icon={UsersRound}
              title="Nenhuma conta interna"
              description="Operadores, portaria e operação aparecem aqui depois do primeiro cadastro."
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Logins de fornecedor"
            title="Quem entra de fora"
            description="As contas dos fornecedores ficam aqui, à parte da equipe interna: o que se decide nelas é se entram ou não, e por qual CNPJ enxergam as notas."
            icon={Building2}
          />
          <div className="border-b border-line px-5 py-3 sm:px-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-rvd-plum" />
              <Input value={buscaDeFornecedor} onChange={evento => setBuscaDeFornecedor(evento.target.value)} placeholder="Buscar por nome, e-mail ou CNPJ..." className="h-10 border-line bg-surface pl-9 text-sm text-rvd-plum" />
            </div>
          </div>
          {fornecedores.isLoading ? (
            <PanelBody><p className="text-sm text-ink-soft">Carregando fornecedores...</p></PanelBody>
          ) : fornecedoresFiltrados.length ? (
            <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
              {fornecedoresFiltrados.map(conta => {
                const bloqueado = conta.accessStatus === "rejected";
                return (
                  <li key={conta.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{conta.companyName || conta.name || "Conta sem nome"}</p>
                      <p className="mt-0.5 truncate text-[13px] text-ink-soft">{conta.email || "E-mail não informado"}</p>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {conta.companyCnpj ? formatarCnpj(conta.companyCnpj) : "Sem CNPJ — não enxerga nota nenhuma"}
                        {conta.lastSignedIn ? ` · último acesso em ${new Date(conta.lastSignedIn).toLocaleDateString("pt-BR")}` : ""}
                      </p>
                      {conta.accessStatus !== "approved" && (
                        <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${bloqueado ? "bg-state-stop-bg text-state-stop" : "bg-state-wait-bg text-state-wait"}`}>
                          {conta.accessStatus === "pending" ? "Aguardando aprovação" : "Bloqueado — não entra no sistema"}
                        </span>
                      )}
                    </div>
                    {/* Fornecedor não muda de perfil: ele é fornecedor. O que se
                        decide aqui é se a conta entra ou não. */}
                    <Button
                      onClick={() => setAccess.mutate({ userId: conta.id, allowed: bloqueado })}
                      disabled={setAccess.isPending}
                      variant="outline"
                      className={`h-9 shrink-0 rounded-xl border-line px-3.5 text-xs font-bold ${bloqueado ? "text-state-go hover:bg-state-go-bg" : "text-state-stop hover:bg-state-stop-bg"}`}
                    >
                      {bloqueado ? <><ShieldCheck className="size-4" />Liberar</> : <><Ban className="size-4" />Bloquear</>}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Building2}
              title={buscaDeFornecedor ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}
              description={buscaDeFornecedor ? "Tente outro nome, e-mail ou CNPJ." : "As contas aparecem aqui assim que o primeiro fornecedor se cadastrar."}
            />
          )}
        </Panel>

        {bloqueados.length > 0 && (
          <Panel>
            <PanelHeader
              eyebrow="Bloqueados"
              title="Contas sem acesso"
              description="Ficam fora das listas acima para não se misturarem com quem trabalha. Continuam no histórico das notas que registraram; só não entram mais."
              icon={Ban}
            />
            <ul className="divide-y divide-line">
              {bloqueados.map(conta => (
                <li key={conta.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{conta.nome || "Conta sem nome"}</p>
                    <p className="mt-0.5 truncate text-[13px] text-ink-soft">{conta.email || "E-mail não informado"}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">{conta.detalhe}</p>
                  </div>
                  <Button
                    onClick={() => setAccess.mutate({ userId: conta.id, allowed: true })}
                    disabled={setAccess.isPending}
                    variant="outline"
                    className="h-9 shrink-0 rounded-xl border-line px-3.5 text-xs font-bold text-state-go hover:bg-state-go-bg"
                  >
                    <ShieldCheck className="size-4" />
                    Liberar de novo
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <EstadoDoSistemaCard />
      <BackupCard />
      </div>
    </PortalLayout>
  );
}
