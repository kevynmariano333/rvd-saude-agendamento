import { Button } from "@/components/ui/button";
import { homePathFor, type PortalRole } from "@/lib/portal";
import { baixarPlanilha } from "@/lib/planilha";
import { formatReportDate, formatReportMoney } from "@/lib/reports";
import { trpc } from "@/lib/trpc";
import { formatSaoPauloDateKey } from "@shared/dateFilters";
import { resumoSemAgendamento, type NotaSemAgendamento } from "@shared/recebimentoSemAgendamento";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Building2, Download, FileWarning, RefreshCw, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

/** Quem pode abrir o relatório: a mesa de agendamento, como no backend. */
const PERFIS_COM_ACESSO: PortalRole[] = ["admin", "operator", "planejador", "planejador_leitura"];

/** As colunas da planilha, na ordem em que saem. */
const COLUNAS = ["Nota fiscal", "Fornecedor", "Unidade", "Pedido", "Status", "Recebido em", "Valor", "Volumes"] as const;

const STATUS: Record<string, string> = { received: "Recebido", completed: "Concluído", backlog: "Backlog" };

/** Quantos dias o relatório olha quando ninguém escolheu período. */
const DIAS_PADRAO = 30;

/** "2026-10-21" como "21/10": sem passar por Date, que leria a data em UTC e voltaria um dia. */
function diaCurto(data: string) {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** A data de hoje em Brasília menos N dias, no formato da consulta. */
function diasAtras(dias: number) {
  const hoje = formatSaoPauloDateKey(new Date());
  const data = new Date(`${hoje}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

function linhaDaPlanilha(nota: NotaSemAgendamento): Record<(typeof COLUNAS)[number], string> {
  return {
    "Nota fiscal": nota.nota,
    Fornecedor: nota.fornecedor,
    Unidade: nota.unidade,
    Pedido: nota.pedido,
    Status: STATUS[nota.status] ?? nota.status,
    "Recebido em": formatReportDate(nota.recebidoEm),
    Valor: nota.valorCentavos === null ? "—" : formatReportMoney(nota.valorCentavos),
    Volumes: nota.volumes === null ? "—" : String(nota.volumes),
  };
}

/**
 * Notas que chegaram no recebimento sem agendamento prévio.
 *
 * A portaria registra essas notas direto, a partir do XML. O relatório mostra
 * a lista para conferir e exportar; o dashboard mostra quantas foram, em que
 * dia, de que unidade e de que fornecedor.
 */
export default function RelatorioSemAgendamento() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const [visao, setVisao] = useState<"relatorio" | "dashboard">("relatorio");
  const [desde, setDesde] = useState(() => diasAtras(DIAS_PADRAO - 1));
  const [ate, setAte] = useState(() => formatSaoPauloDateKey(new Date()));
  const consulta = trpc.reports.semAgendamento.useQuery(
    { desde, ate },
    { enabled: Boolean(auth.data && PERFIS_COM_ACESSO.includes(auth.data.role as PortalRole)), placeholderData: anterior => anterior },
  );

  useEffect(() => {
    if (auth.data === null) setLocation("/");
    else if (auth.data && !PERFIS_COM_ACESSO.includes(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole));
  }, [auth.data, setLocation]);

  const notas: NotaSemAgendamento[] = consulta.data?.notas ?? [];
  const resumo = consulta.data?.resumo ?? resumoSemAgendamento([]);

  const baixarExcel = async () => {
    if (!notas.length) return toast.error("Não há notas para exportar neste período.");
    await baixarPlanilha({
      linhas: notas.map(linhaDaPlanilha),
      colunas: COLUNAS,
      larguras: COLUNAS.map(coluna => Math.max(16, coluna.length + 6)),
      aba: "Sem agendamento",
      arquivo: `notas-recebidas-sem-agendamento-${desde}-a-${ate}.xlsx`,
    });
  };

  if (!auth.data || !PERFIS_COM_ACESSO.includes(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  return (
    <PortalLayout user={auth.data} title="Relatórios" subtitle="Notas recebidas sem agendamento prévio." onLogout={() => logout.mutate()}>
      <section className="overflow-hidden rounded-3xl bg-[#172136] p-6 text-white shadow-xl shadow-rvd-plum/10 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-on-brand"><FileWarning className="size-7" /></span>
            <div>
              <p className="font-display text-3xl font-extrabold">Recebidas sem agendamento</p>
              <p className="mt-1 text-sm text-white/75">Notas que entraram no recebimento sem data marcada antes.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-white/75">
              De
              <input type="date" value={desde} max={ate} onChange={evento => setDesde(evento.target.value)} className="h-11 rounded-xl bg-surface px-3 text-sm font-bold text-rvd-plum" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-white/75">
              Até
              <input type="date" value={ate} min={desde} onChange={evento => setAte(evento.target.value)} className="h-11 rounded-xl bg-surface px-3 text-sm font-bold text-rvd-plum" />
            </label>
            <Button onClick={() => consulta.refetch()} variant="ghost" className="h-11 rounded-xl bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><RefreshCw className="size-4" />Atualizar</Button>
            <Button onClick={baixarExcel} disabled={!notas.length} className="h-11 rounded-xl bg-rvd-blue font-bold text-rvd-plum hover:bg-rvd-blue-pale"><Download className="size-4" />Exportar Excel ({notas.length})</Button>
          </div>
        </div>
      </section>

      <div className="mt-7 flex gap-2">
        <AbaDeVisao ativa={visao === "relatorio"} onClick={() => setVisao("relatorio")} icone={Table2} rotulo="Relatório" />
        <AbaDeVisao ativa={visao === "dashboard"} onClick={() => setVisao("dashboard")} icone={BarChart3} rotulo="Dashboard" />
      </div>

      {consulta.isLoading ? (
        <div className="mt-7 panel py-16 text-center font-bold text-rvd-plum">Carregando notas...</div>
      ) : visao === "dashboard" ? (
        <Dashboard resumo={resumo} periodo={{ desde, ate }} />
      ) : (
        <section className="mt-7 overflow-hidden panel">
          <div className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-faint">Lista</p>
              <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Notas no período</h2>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-rvd-plum-pale px-3 py-1.5 text-xs font-bold text-rvd-plum">{notas.length} nota(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead className="bg-sunken">
                <tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                  {COLUNAS.map(coluna => <th key={coluna} className="px-4 py-4">{coluna}</th>)}
                </tr>
              </thead>
              <tbody>
                {notas.length ? notas.map(nota => {
                  const linha = linhaDaPlanilha(nota);
                  return (
                    <tr key={nota.id} className="border-t border-line text-sm text-ink-soft">
                      {COLUNAS.map(coluna => (
                        <td key={coluna} className={`px-4 py-4 ${coluna === "Fornecedor" ? "font-bold text-rvd-plum" : ""} ${coluna === "Nota fiscal" ? "font-display font-extrabold text-ink" : ""}`}>{linha[coluna]}</td>
                      ))}
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={COLUNAS.length} className="px-5 py-16 text-center">
                      <FileWarning className="mx-auto size-6 text-rvd-plum" />
                      <p className="mt-3 font-bold text-rvd-plum">Nenhuma nota recebida sem agendamento</p>
                      <p className="mt-1 text-sm text-ink-soft">Ajuste o período para consultar outras datas.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PortalLayout>
  );
}

function AbaDeVisao({ ativa, onClick, icone: Icone, rotulo }: { ativa: boolean; onClick: () => void; icone: typeof Table2; rotulo: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${ativa ? "bg-rvd-plum text-white" : "bg-surface text-ink-soft hover:text-ink"}`}
    >
      <Icone className="size-4" />
      {rotulo}
    </button>
  );
}

function Dashboard({ resumo, periodo }: { resumo: ReturnType<typeof resumoSemAgendamento>; periodo: { desde: string; ate: string } }) {
  const maiorFornecedor = resumo.porFornecedor[0]?.quantidade ?? 0;
  return (
    <div className="mt-7 space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <Cartao rotulo="Notas no período" valor={resumo.total} detalhe={`${periodo.desde} a ${periodo.ate}`} icone={FileWarning} />
        <Cartao rotulo="Unidades" valor={resumo.porUnidade.length} detalhe={resumo.porUnidade.map(item => `${item.unidade}: ${item.quantidade}`).join(" · ") || "—"} icone={Building2} />
        <Cartao rotulo="Fornecedores" valor={resumo.porFornecedor.length} detalhe={resumo.porFornecedor[0] ? `Mais notas: ${resumo.porFornecedor[0].fornecedor}` : "—"} icone={Building2} />
      </section>

      <section className="panel p-5 shadow-sm sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Recebimento</p>
        <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Notas sem agendamento por dia</h2>
        <div className="mt-5 h-72">
          {resumo.porDia.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resumo.porDia.map(item => ({ dia: diaCurto(item.data), quantidade: item.quantidade }))} margin={{ top: 12, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E7E0EA" />
                <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: "rgba(120,32,120,0.06)" }} />
                <Bar dataKey="quantidade" name="Notas" fill="#782078" maxBarSize={32} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-ink-soft">Nenhuma nota recebida sem agendamento neste período.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5 shadow-sm sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Fornecedores</p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Quem mais chegou sem agendar</h2>
          {resumo.porFornecedor.length ? (
            <ol className="mt-5 divide-y divide-line">
              {resumo.porFornecedor.map((item, indice) => (
                <li key={item.fornecedor} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <span className="min-w-0 truncate text-sm font-bold text-rvd-plum">{indice + 1}. {item.fornecedor}</span>
                    <span className="shrink-0 font-display text-lg font-extrabold text-ink">{item.quantidade}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-sunken">
                    <div className="h-1.5 rounded-full bg-rvd-plum" style={{ width: `${Math.round((item.quantidade / maiorFornecedor) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-5 text-sm text-ink-soft">Nenhum fornecedor no período.</p>
          )}
        </section>

        <section className="panel p-5 shadow-sm sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Unidades</p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Onde chegaram</h2>
          {resumo.porUnidade.length ? (
            <ul className="mt-5 divide-y divide-line">
              {resumo.porUnidade.map(item => (
                <li key={item.unidade} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <span className="text-sm font-bold text-rvd-plum">{item.unidade}</span>
                  <span className="font-display text-lg font-extrabold text-ink">{item.quantidade}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-ink-soft">Nenhuma unidade no período.</p>
          )}
        </section>
      </section>
    </div>
  );
}

function Cartao({ rotulo, valor, detalhe, icone: Icone }: { rotulo: string; valor: number; detalhe: string; icone: typeof Table2 }) {
  return (
    <article className="panel flex items-center gap-4 p-5">
      <span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum"><Icone className="size-5" /></span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{rotulo}</p>
        <p className="mt-1 font-display text-2xl font-extrabold text-ink">{valor}</p>
        <p className="mt-1 truncate text-xs text-ink-soft">{detalhe}</p>
      </div>
    </article>
  );
}
