import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { homePathFor, isPortalAdmin, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { formatarCnpj } from "@shared/recipients";
import { Building2, Download, Mail, RefreshCw, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

/** As colunas da planilha, na ordem em que saem. */
const COLUNAS = ["Fornecedor", "CNPJ", "Cadastro no portal", "Contato", "E-mail", "Situação do acesso", "Último acesso", "Notas no sistema"] as const;

const SITUACAO: Record<string, string> = { approved: "Liberado", pending: "Aguardando liberação", rejected: "Bloqueado" };

const data = (valor: Date | string | null) =>
  valor ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(valor)) : "—";

/**
 * Quando a conta entrou pela última vez — ou se nunca entrou.
 *
 * A coluna `lastSignedIn` não aceita vazio: nasce com a hora do cadastro e só
 * muda quando alguém entra de verdade. Mostrar o que está gravado faria toda
 * conta recém-criada parecer que já foi usada, no dia em que foi criada. Se a
 * data não passou da criação, ninguém entrou.
 */
function ultimoAcesso(conta: { temLogin: boolean; lastSignedIn: Date | string | null; criadoEm: Date | string | null }): string {
  if (!conta.temLogin) return "Sem cadastro";
  if (!conta.lastSignedIn || !conta.criadoEm) return "Nunca entrou";
  const entrou = new Date(conta.lastSignedIn).getTime();
  const criou = new Date(conta.criadoEm).getTime();
  return entrou > criou ? data(conta.lastSignedIn) : "Nunca entrou";
}

type Fornecedor = {
  cnpj: string | null;
  nome: string | null;
  temLogin: boolean;
  contato: string | null;
  email: string | null;
  accessStatus: string | null;
  lastSignedIn: Date | string | null;
  criadoEm: Date | string | null;
  notas: number;
  ultimaNota: Date | string | null;
};

/** Uma linha da planilha a partir de uma conta. */
function linhaDaPlanilha(fornecedor: Fornecedor): Record<string, string> {
  return {
    Fornecedor: fornecedor.nome || "Não informado",
    CNPJ: fornecedor.cnpj ? formatarCnpj(fornecedor.cnpj) : "Não informado",
    "Cadastro no portal": fornecedor.temLogin ? "Sim" : "Não",
    // Sem login não há contato nem e-mail: o acervo do sistema antigo nunca
    // trouxe e-mail, só CNPJ e nome.
    Contato: fornecedor.temLogin ? fornecedor.contato || "Não informado" : "—",
    "E-mail": fornecedor.temLogin ? fornecedor.email || "Não informado" : "—",
    "Situação do acesso": fornecedor.temLogin ? SITUACAO[fornecedor.accessStatus ?? ""] ?? (fornecedor.accessStatus || "—") : "Sem cadastro",
    "Último acesso": ultimoAcesso(fornecedor),
    "Notas no sistema": String(fornecedor.notas),
  };
}

/**
 * Quem tem login de fornecedor no portal.
 *
 * A pergunta "esse fornecedor já está no sistema, e com qual e-mail?" só se
 * respondia abrindo a tela de acessos e rolando a lista. Aqui ela vira consulta
 * e planilha.
 *
 * Só administrador: é a relação de contato das empresas parceiras reunida num
 * arquivo que sai do portal, e isso não é dado de operação do dia.
 */
export default function RelatorioDeFornecedores() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const contas = trpc.reports.fornecedores.useQuery(undefined, { enabled: Boolean(auth.data && isPortalAdmin(auth.data.role as PortalRole)) });
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (auth.data === null) setLocation("/");
    else if (auth.data && !isPortalAdmin(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole));
  }, [auth.data, setLocation]);

  const linhas = useMemo(() => {
    const procurado = busca.trim().toLowerCase();
    const digitos = procurado.replace(/\D/g, "");
    const todas = (contas.data ?? []) as Fornecedor[];
    // A busca por CNPJ ignora a pontuação: ninguém digita a máscara inteira.
    const filtradas = !procurado
      ? todas
      : todas.filter(fornecedor =>
          [fornecedor.nome, fornecedor.contato, fornecedor.email].some(campo => campo?.toLowerCase().includes(procurado)) ||
          (digitos.length >= 3 && (fornecedor.cnpj ?? "").includes(digitos)),
        );
    return filtradas.map(linhaDaPlanilha);
  }, [busca, contas.data]);

  const baixarExcel = () => {
    if (!linhas.length) return toast.error("Não há fornecedores para exportar.");
    const planilha = XLSX.utils.json_to_sheet(linhas, { header: [...COLUNAS] });
    planilha["!cols"] = COLUNAS.map(coluna => ({ wch: Math.max(18, coluna.length + 8) }));
    const arquivo = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(arquivo, planilha, "Fornecedores");
    XLSX.writeFile(arquivo, `fornecedores-cadastrados-rvd-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!auth.data || !isPortalAdmin(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  const todos = (contas.data ?? []) as Fornecedor[];
  const comLogin = todos.filter(fornecedor => fornecedor.temLogin).length;

  return (
    <PortalLayout user={auth.data} title="Relatórios" subtitle="Todos os fornecedores do sistema, com login e sem." onLogout={() => logout.mutate()}>
      <section className="overflow-hidden rounded-3xl bg-[#172136] p-6 text-white shadow-xl shadow-rvd-plum/10 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-on-brand"><Users className="size-7" /></span>
            <div>
              <p className="font-display text-3xl font-extrabold">Fornecedores cadastrados</p>
              <p className="mt-1 text-sm text-white/75">Todos os fornecedores do sistema — com login no portal e sem.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => contas.refetch()} variant="ghost" className="h-11 rounded-xl bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><RefreshCw className="size-4" />Atualizar</Button>
            <Button onClick={baixarExcel} disabled={!linhas.length} className="h-11 rounded-xl bg-rvd-blue font-bold text-rvd-plum hover:bg-rvd-blue-pale"><Download className="size-4" />Exportar Excel ({linhas.length})</Button>
          </div>
        </div>
      </section>

      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <Resumo rotulo="Fornecedores no sistema" valor={todos.length} icone={Building2} />
        <Resumo rotulo="Com login no portal" valor={comLogin} icone={Mail} />
        <Resumo rotulo="Ainda sem cadastro" valor={todos.length - comLogin} icone={Users} />
      </section>

      <section className="mt-7 rounded-3xl bg-sunken p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <Search className="size-5 shrink-0 text-rvd-plum" />
          <Input value={busca} onChange={evento => setBusca(evento.target.value)} placeholder="Buscar por empresa, contato, e-mail ou CNPJ..." className="h-11 bg-surface" />
        </div>
      </section>

      <section className="mt-7 overflow-hidden panel">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-faint">Cadastro</p>
            <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Fornecedores do sistema</h2>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-rvd-plum-pale px-3 py-1.5 text-xs font-bold text-rvd-plum">{linhas.length} fornecedor(es)</span>
        </div>
        {contas.isLoading ? (
          <div className="py-16 text-center font-bold text-rvd-plum">Carregando fornecedores...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-sunken">
                <tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                  {COLUNAS.map(coluna => <th key={coluna} className="px-4 py-4">{coluna}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.length ? linhas.map((linha, indice) => (
                  <tr key={`${linha["E-mail"]}-${indice}`} className="border-t border-line text-sm text-ink-soft">
                    {COLUNAS.map(coluna => (
                      <td key={coluna} className={`px-4 py-4 ${coluna === "Fornecedor" ? "font-bold text-rvd-plum" : ""} ${coluna === "CNPJ" ? "whitespace-nowrap font-mono text-xs" : ""} ${coluna === "Cadastro no portal" ? (linha[coluna] === "Sim" ? "font-bold text-state-go" : "font-bold text-state-stop") : ""}`}>{linha[coluna]}</td>
                    ))}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={COLUNAS.length} className="px-5 py-16 text-center">
                      <Search className="mx-auto size-6 text-rvd-plum" />
                      <p className="mt-3 font-bold text-rvd-plum">Nenhum fornecedor encontrado</p>
                      <p className="mt-1 text-sm text-ink-soft">Ajuste a busca para consultar o cadastro.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PortalLayout>
  );
}

function Resumo({ rotulo, valor, icone: Icone }: { rotulo: string; valor: number; icone: typeof Users }) {
  return (
    <article className="panel flex items-center gap-4 p-5">
      <span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum"><Icone className="size-5" /></span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{rotulo}</p>
        <p className="mt-1 font-display text-2xl font-extrabold text-ink">{valor}</p>
      </div>
    </article>
  );
}
