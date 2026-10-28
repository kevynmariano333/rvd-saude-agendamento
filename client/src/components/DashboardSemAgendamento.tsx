import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { BarraEm3D, barraEm3DStyle, PROFUNDIDADE_3D } from "@/components/BarraEm3D";
import { formatSaoPauloDateKey } from "@shared/dateFilters";
import { Building2, FileWarning } from "lucide-react";
import { useLocation } from "wouter";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RankingDaUnidade, ResumoSemAgendamento } from "@shared/recebimentoSemAgendamento";

/** Quantos dias o painel olha quando ninguém escolheu período. */
export const DIAS_PADRAO = 30;

/** A data de hoje em Brasília menos N dias, no formato da consulta. */
export function diasAtras(dias: number) {
  const hoje = formatSaoPauloDateKey(new Date());
  const data = new Date(`${hoje}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

/**
 * O painel de sem agendamento na tela do operador. Usa o mesmo mês, ano e dia
 * que a visão geral mostra, para os dois falarem do mesmo período.
 */
export function PainelDeSemAgendamento({ month, year, day }: { month: number; year: number; day: number }) {
  const [, setLocation] = useLocation();
  const mes = String(month).padStart(2, "0");
  const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const desde = day > 0 ? `${year}-${mes}-${String(day).padStart(2, "0")}` : `${year}-${mes}-01`;
  const ate = day > 0 ? desde : `${year}-${mes}-${String(ultimoDia).padStart(2, "0")}`;
  const consulta = trpc.reports.semAgendamento.useQuery({ desde, ate });
  const rotuloDoPeriodo = day > 0 ? `${String(day).padStart(2, "0")}/${mes}/${year}` : `${mes}/${year}`;
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Sem agendamento</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-ink">Notas recebidas sem agendamento</h2>
          <p className="mt-1 text-sm text-ink-soft">Período da visão geral: {rotuloDoPeriodo}.</p>
        </div>
        <button type="button" onClick={() => setLocation("/operador/relatorios/sem-agendamento")} className="w-fit rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white">
          Abrir relatório completo
        </button>
      </div>
      {consulta.isLoading || !consulta.data ? (
        <div className="panel py-16 text-center font-bold text-rvd-plum">Carregando notas sem agendamento...</div>
      ) : (
        <DashboardSemAgendamento resumo={consulta.data.resumo} periodo={{ desde, ate }} />
      )}
    </section>
  );
}

/** "2026-10-21" como "21/10": sem passar por Date, que leria a data em UTC e voltaria um dia. */
function diaCurto(data: string) {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** O nome que a equipe usa para cada unidade da Amil nos filtros. */
const NOME_DA_UNIDADE: Record<string, string> = { HSH: "Hospital", MSH: "Maternidade" };

/** As cores de cada unidade no gráfico: a frente, a tampa de cima e a lateral, para dar volume. */
/** As cores das unidades da Amil: azul forte para o Hospital, azul bebê para a Maternidade. */
const COR_DA_UNIDADE: Record<string, string> = { HSH: "#4B2BFF", MSH: "#8DD3F5" };
const COR_PADRAO = "#8B93A6";

/** O número do dia em cima da coluna empilhada, centralizado. */
function TotalDoDia(entrada: unknown) {
  const { x = 0, y = 0, width = 0, value } = entrada as { x?: number; y?: number; width?: number; value?: number };
  return (
    <text x={x + width / 2 + PROFUNDIDADE_3D / 2} y={y - PROFUNDIDADE_3D - 6} textAnchor="middle" style={{ fill: "var(--color-ink)" }} fontSize={12} fontWeight={800}>
      {value ?? 0}
    </text>
  );
}

export function DashboardSemAgendamento({ resumo, periodo }: { resumo: ResumoSemAgendamento; periodo: { desde: string; ate: string } }) {
  const unidadesNoGrafico = resumo.porUnidade.map(item => item.unidade);
  const [unidadesOcultas, setUnidadesOcultas] = useState<string[]>([]);
  const alternarUnidade = (unidade: string) =>
    setUnidadesOcultas(atuais => (atuais.includes(unidade) ? atuais.filter(item => item !== unidade) : [...atuais, unidade]));
  const unidadesVisiveis = unidadesNoGrafico.filter(unidade => !unidadesOcultas.includes(unidade));
  const ultimaVisivel = unidadesVisiveis[unidadesVisiveis.length - 1];
  const dadosDoGrafico = resumo.porDiaEUnidade.map(dia => ({
    dia: diaCurto(dia.data),
    total: dia.total,
    ...Object.fromEntries(unidadesNoGrafico.map(unidade => [unidade, dia.unidades[unidade] ?? 0])),
  }));
  return (
    <div className="mt-7 space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <Cartao rotulo="Notas no período" valor={resumo.total} detalhe={`${periodo.desde} a ${periodo.ate}`} icone={FileWarning} />
        <Cartao rotulo="Unidades" valor={resumo.porUnidade.length} detalhe={resumo.porUnidade.map(item => `${item.unidade}: ${item.quantidade}`).join(" · ") || "—"} icone={Building2} />
        <Cartao rotulo="Fornecedores" valor={resumo.porFornecedor.length} detalhe={resumo.porFornecedor[0] ? `Mais notas: ${resumo.porFornecedor[0].fornecedor}` : "—"} icone={Building2} />
      </section>

      <section className="panel p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Recebimento</p>
            <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Notas sem agendamento por dia</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px] font-bold text-ink-soft">
            {unidadesNoGrafico.map(unidade => {
              const oculta = unidadesOcultas.includes(unidade);
              return (
                <button
                  key={unidade}
                  type="button"
                  onClick={() => alternarUnidade(unidade)}
                  aria-pressed={!oculta}
                  title={oculta ? `Mostrar ${unidade}` : `Esconder ${unidade}`}
                  className={`inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 transition ${oculta ? "opacity-40" : ""}`}
                >
                  <span className="size-2.5 rounded-full" style={{ background: COR_DA_UNIDADE[unidade] ?? COR_PADRAO }} />
                  {NOME_DA_UNIDADE[unidade] ?? unidade}
                  <span className="font-display text-sm font-extrabold text-ink">{resumo.porUnidade.find(item => item.unidade === unidade)?.quantidade ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-5 h-80">
          {dadosDoGrafico.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosDoGrafico} margin={{ top: 28, right: 8, left: -16, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="#E7E0EA" />
                <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: "rgba(120,32,120,0.06)" }} />
                {unidadesNoGrafico.map(unidade => (
                  <Bar key={unidade} dataKey={unidade} name={unidade} stackId="dia" shape={BarraEm3D as never} fill={COR_DA_UNIDADE[unidade] ?? COR_PADRAO} maxBarSize={40} hide={unidadesOcultas.includes(unidade)}>
                    {unidade === ultimaVisivel && <LabelList dataKey="total" content={TotalDoDia as never} />}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-ink-soft">Nenhuma nota recebida sem agendamento neste período.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {resumo.ranking.length ? resumo.ranking.map(grupo => <RankingDaUnidade key={grupo.unidade} grupo={grupo} />) : (
          <section className="panel p-5 shadow-sm sm:p-7 xl:col-span-2">
            <p className="text-sm text-ink-soft">Nenhum fornecedor no período.</p>
          </section>
        )}
      </section>
    </div>
  );
}

/** O ranking de uma unidade: quem mandou, a quantidade e a parte dela na unidade. */
function RankingDaUnidade({ grupo }: { grupo: RankingDaUnidade }) {
  const maior = grupo.fornecedores[0]?.quantidade ?? 0;
  return (
    <section className="panel p-5 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Ranking</p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-ink">{grupo.unidade}</h2>
        </div>
        <span className="rounded-xl bg-rvd-plum-pale px-3 py-1.5 text-xs font-bold text-rvd-plum">{grupo.total} nota(s)</span>
      </div>
      <ol className="mt-5 divide-y divide-line">
        {grupo.fornecedores.map((item, indice) => (
          <li key={item.fornecedor} className="py-3 first:pt-0 last:pb-0" title={`${item.fornecedor}: ${item.quantidade} nota(s)`}>
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 truncate text-sm font-bold text-rvd-plum">{indice + 1}. {item.fornecedor}</span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-lg font-extrabold text-ink">{item.quantidade}</span>
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-sunken">
              <div className="h-1.5 rounded-full" style={{ width: `${Math.round((item.quantidade / maior) * 100)}%`, ...barraEm3DStyle("#782078") }} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Cartao({ rotulo, valor, detalhe, icone: Icone }: { rotulo: string; valor: number; detalhe: string; icone: typeof FileWarning }) {
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
