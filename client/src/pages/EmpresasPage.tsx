import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { homePathFor, isPortalAdmin, roleLabel, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { formatarCnpj } from "@shared/recipients";
import { Building2, Check, Plus, Search, UserPlus, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import LoadingTruck from "../components/LoadingTruck";
import PortalLayout from "./PortalLayout";

/** Os perfis que o administrador pode criar, na ordem em que são pedidos. */
const PERFIS: PortalRole[] = ["supplier", "operator", "planejador", "portaria", "operacao", "admin"];

export default function EmpresasPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const lista = trpc.empresas.lista.useQuery(undefined, { enabled: Boolean(auth.data) });
  const [busca, setBusca] = useState("");
  const [empresaAberta, setEmpresaAberta] = useState<number | null>(null);
  const [novaEmpresaAberta, setNovaEmpresaAberta] = useState(false);
  const [nomeDaEmpresa, setNomeDaEmpresa] = useState("");
  const [novoUsuarioAberto, setNovoUsuarioAberto] = useState(false);

  const membros = trpc.empresas.membros.useQuery({ empresaId: empresaAberta ?? 0 }, { enabled: Boolean(empresaAberta) });

  const criar = trpc.empresas.criar.useMutation({
    onSuccess: empresa => {
      toast.success(`Empresa "${empresa.nome}" criada.`);
      setNovaEmpresaAberta(false);
      setNomeDaEmpresa("");
      setEmpresaAberta(empresa.id);
      utils.empresas.lista.invalidate();
    },
    onError: erro => toast.error(erro.message),
  });
  const agrupar = trpc.empresas.agrupar.useMutation({
    onSuccess: () => {
      toast.success("Agrupamento atualizado.");
      utils.empresas.lista.invalidate();
      utils.empresas.membros.invalidate();
    },
    onError: erro => toast.error(erro.message),
  });

  useEffect(() => {
    if (auth.data && !isPortalAdmin(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole));
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  const empresas = lista.data?.empresas ?? [];
  const cnpjs = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    const digitos = texto.replace(/\D/g, "");
    return (lista.data?.cnpjs ?? []).filter(item => {
      if (!texto) return true;
      const nome = (item.nome ?? "").toLowerCase();
      return nome.includes(texto) || (digitos.length > 0 && item.cnpj.includes(digitos));
    });
  }, [busca, lista.data]);
  const agrupados = (lista.data?.cnpjs ?? []).filter(item => item.empresaId).length;

  if (auth.isLoading) return <LoadingTruck label="Carregando as empresas" />;
  if (!auth.data || !isPortalAdmin(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  return <PortalLayout
    user={auth.data}
    title="Empresas"
    subtitle="Agrupe CNPJs de um mesmo fornecedor. Quem está numa empresa enxerga as notas de todos os CNPJs dela."
    onLogout={() => logout.mutate()}
    actions={<Button onClick={() => setNovoUsuarioAberto(true)} className="rounded-xl bg-brand font-bold text-white hover:bg-brand/90"><UserPlus className="size-4" />Criar usuário</Button>}
  >
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="overflow-hidden panel">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">CNPJs de fornecedor</p>
            <p className="mt-0.5 text-[13px] text-ink-soft">{lista.data?.cnpjs.length ?? 0} CNPJs · {agrupados} agrupado(s) em {empresas.length} empresa(s)</p>
          </div>
          <Button onClick={() => setNovaEmpresaAberta(true)} variant="outline" className="rounded-xl border-line bg-surface text-[13px] font-bold text-rvd-plum hover:bg-rvd-plum-pale"><Plus className="size-4" />Nova empresa</Button>
        </header>
        <div className="border-b border-line px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-rvd-plum" />
            <Input value={busca} onChange={evento => setBusca(evento.target.value)} placeholder="Buscar por nome ou CNPJ..." className="h-10 border-line bg-surface pl-9 text-sm text-rvd-plum" />
          </div>
        </div>
        <div className="max-h-[32rem] divide-y divide-line overflow-y-auto">
          {lista.isLoading && <p className="px-5 py-10 text-center text-sm font-bold text-rvd-plum">Carregando...</p>}
          {!lista.isLoading && !cnpjs.length && <p className="px-5 py-10 text-center text-sm text-ink-soft">Nenhum CNPJ encontrado.</p>}
          {cnpjs.map(item => {
            const empresa = empresas.find(uma => uma.id === item.empresaId);
            return (
              <div key={item.cnpj} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-extrabold text-ink">
                    <Building2 className="size-4 shrink-0 text-rvd-plum" />
                    <span className="truncate">{item.nome || "Fornecedor sem razão social"}</span>
                    {empresa
                      ? <span className="rounded-md bg-state-go-bg px-2 py-0.5 text-[10px] font-bold uppercase text-state-go">{empresa.nome}</span>
                      : <span className="rounded-md bg-state-wait-bg px-2 py-0.5 text-[10px] font-bold uppercase text-state-wait">Não agrupada</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">{formatarCnpj(item.cnpj)} · {item.notas} nota(s) · {item.contas} conta(s)</p>
                </div>
                {/* Agrupar é mudar quem enxerga o quê, então a escolha é direta:
                    a empresa na própria linha, sem tela intermediária. */}
                <select
                  value={item.empresaId ?? ""}
                  onChange={evento => agrupar.mutate({ cnpj: item.cnpj, empresaId: evento.target.value ? Number(evento.target.value) : null })}
                  className="h-9 shrink-0 rounded-xl border border-line bg-surface px-2 text-xs font-bold text-rvd-plum focus:outline-none focus:ring-2 focus:ring-rvd-blue"
                >
                  <option value="">Sem empresa</option>
                  {empresas.map(empresaDaLista => <option key={empresaDaLista.id} value={empresaDaLista.id}>{empresaDaLista.nome}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden panel">
        <header className="border-b border-line px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Empresas</p>
          <p className="mt-0.5 text-[13px] text-ink-soft">Escolha uma empresa para ver quem está nela.</p>
        </header>
        {!empresas.length && <p className="px-5 py-10 text-center text-sm text-ink-soft">Nenhuma empresa criada ainda.</p>}
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {empresas.map(empresa => (
            <button
              key={empresa.id}
              type="button"
              onClick={() => setEmpresaAberta(atual => (atual === empresa.id ? null : empresa.id))}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition ${empresaAberta === empresa.id ? "bg-brand text-white" : "bg-sunken text-rvd-plum hover:bg-rvd-plum-pale"}`}
            >
              {empresaAberta === empresa.id && <Check className="size-3.5" />}
              {empresa.nome}
            </button>
          ))}
        </div>
        {empresaAberta && (
          <div className="border-t border-line">
            <p className="flex items-center gap-2 px-5 pt-4 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint"><Users className="size-3.5" />Membros</p>
            <div className="divide-y divide-line">
              {membros.isLoading && <p className="px-5 py-8 text-center text-sm text-ink-soft">Carregando...</p>}
              {!membros.isLoading && !membros.data?.length && <p className="px-5 py-8 text-center text-sm text-ink-soft">Nenhuma conta nesta empresa. Agrupe um CNPJ à esquerda.</p>}
              {(membros.data ?? []).map(membro => (
                <div key={membro.id} className="px-5 py-3">
                  <p className="text-[13px] font-bold text-ink">{membro.nome || membro.email}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">{membro.email} · {formatarCnpj(membro.cnpj)}{membro.acesso !== "approved" ? ` · ${membro.acesso === "pending" ? "aguardando aprovação" : "acesso recusado"}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>

    <Dialog open={novaEmpresaAberta} onOpenChange={aberto => !aberto && setNovaEmpresaAberta(false)}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:max-w-md">
        <DialogHeader className="border-b border-line px-6 py-5">
          <DialogTitle className="font-display text-lg font-extrabold text-ink">Nova empresa</DialogTitle>
          <DialogDescription className="text-[13px] text-ink-soft">Depois de criar, agrupe os CNPJs dela na lista ao lado.</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5">
          <Label htmlFor="empresa-nome" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Nome da empresa *</Label>
          <Input id="empresa-nome" value={nomeDaEmpresa} onChange={evento => setNomeDaEmpresa(evento.target.value)} maxLength={255} placeholder="Ex.: Grupo Cirúrgica Fernandes" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={() => setNovaEmpresaAberta(false)} className="font-bold text-ink-soft hover:bg-sunken">Cancelar</Button>
          <Button onClick={() => criar.mutate({ nome: nomeDaEmpresa.trim() })} disabled={criar.isPending || nomeDaEmpresa.trim().length < 2} className="h-10 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand disabled:opacity-50">{criar.isPending ? "Criando..." : "Criar empresa"}</Button>
        </footer>
      </DialogContent>
    </Dialog>

    <NovoUsuarioDialog open={novoUsuarioAberto} onOpenChange={setNovoUsuarioAberto} onCriado={() => utils.empresas.lista.invalidate()} />
  </PortalLayout>;
}

/**
 * Criação de conta pelo administrador.
 *
 * Antes existiam dois caminhos para entrar: o fornecedor se cadastrar e esperar
 * aprovação, ou a conta de teste. Quem precisava liberar um operador novo não
 * tinha por onde — e acabava emprestando login, que é o pior dos mundos. A
 * conta criada aqui já nasce liberada, porque quem a criou é quem aprovaria.
 */
function NovoUsuarioDialog({ open, onOpenChange, onCriado }: { open: boolean; onOpenChange: (open: boolean) => void; onCriado: () => void }) {
  const [role, setRole] = useState<PortalRole>("supplier");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");

  const criar = trpc.staff.criarUsuario.useMutation({
    onSuccess: usuario => {
      toast.success(`Conta de ${usuario.name || usuario.email} criada. Ela já pode entrar.`);
      setNome(""); setEmail(""); setSenha(""); setRazaoSocial(""); setCnpj("");
      onCriado();
      onOpenChange(false);
    },
    onError: erro => toast.error(erro.message),
  });

  const ehFornecedor = role === "supplier";
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (nome.trim().length < 2) return toast.error("Informe o nome.");
    if (!email.includes("@")) return toast.error("Informe um e-mail válido.");
    if (senha.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");
    if (ehFornecedor && cnpj.replace(/\D/g, "").length !== 14) return toast.error("Informe o CNPJ do fornecedor com 14 dígitos.");
    criar.mutate({ nome: nome.trim(), email: email.trim(), senha, role, razaoSocial: razaoSocial.trim() || undefined, cnpj: cnpj || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><UserPlus className="size-5" /></span>
            <div>
              <DialogTitle className="font-display text-lg font-extrabold text-ink">Criar usuário</DialogTitle>
              <DialogDescription className="text-[13px] text-ink-soft">A conta já entra depois de criada, sem passar por aprovação.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4 px-6 py-5">
          <div>
            <Label className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Tipo de perfil *</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PERFIS.map(perfil => (
                <button key={perfil} type="button" onClick={() => setRole(perfil)} aria-pressed={role === perfil} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${role === perfil ? "bg-brand text-white" : "bg-sunken text-rvd-plum hover:bg-rvd-plum-pale"}`}>
                  {roleLabel[perfil]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="novo-nome" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Nome completo *</Label>
            <Input id="novo-nome" value={nome} onChange={evento => setNome(evento.target.value)} maxLength={255} placeholder="Nome de quem vai usar a conta" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="novo-email" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">E-mail *</Label>
              <Input id="novo-email" type="email" value={email} onChange={evento => setEmail(evento.target.value)} maxLength={320} placeholder="email@empresa.com" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
            </div>
            <div>
              <Label htmlFor="novo-senha" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Senha de acesso *</Label>
              <Input id="novo-senha" value={senha} onChange={evento => setSenha(evento.target.value)} maxLength={200} placeholder="Mínimo 6 caracteres" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
            </div>
          </div>
          {/* Só o fornecedor precisa de CNPJ: é por ele que as notas dele são
              encontradas. Um operador sem CNPJ enxerga tudo, por função. */}
          {ehFornecedor && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="novo-cnpj" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">CNPJ *</Label>
                <Input id="novo-cnpj" value={cnpj} onChange={evento => setCnpj(evento.target.value)} inputMode="numeric" maxLength={20} placeholder="00000000000000" className="mt-2 h-11 border-line bg-surface font-mono text-rvd-plum" />
              </div>
              <div>
                <Label htmlFor="novo-razao" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Razão social</Label>
                <Input id="novo-razao" value={razaoSocial} onChange={evento => setRazaoSocial(evento.target.value)} maxLength={255} placeholder="Nome da empresa" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
              </div>
            </div>
          )}
          <p className="rounded-xl bg-sunken px-4 py-3 text-[11px] leading-4 text-ink-soft">
            Anote a senha e passe para a pessoa por um canal seguro. Ela pode trocá-la depois pelo menu do próprio nome.
          </p>
        </form>
        <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-ink-soft hover:bg-sunken">Cancelar</Button>
          <Button type="button" onClick={enviar} disabled={criar.isPending} className="h-10 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand"><UserPlus className="size-4" />{criar.isPending ? "Criando..." : "Criar conta"}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
