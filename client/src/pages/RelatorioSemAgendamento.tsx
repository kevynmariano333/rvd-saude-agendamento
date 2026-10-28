import { Button } from "@/components/ui/button";
import { homePathFor, type PortalRole } from "@/lib/portal";
import { baixarPlanilhaSemAgendamento, COLUNAS_DA_NOTA, linhaDaNota } from "@/lib/planilhaSemAgendamento";
import { DashboardSemAgendamento, DIAS_PADRAO, diasAtras } from "@/components/DashboardSemAgendamento";
import { trpc } from "@/lib/trpc";
import { formatSaoPauloDateKey } from "@shared/dateFilters";
import { resumoSemAgendamento, type NotaSemAgendamento } from "@shared/recebimentoSemAgendamento";
import { BarChart3, Download, FileWarning, RefreshCw, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

/** Quem pode abrir o relatório: a mesa de agendamento, como no backend. */
const PERFIS_COM_ACESSO: PortalRole[] = ["admin", "operator", "planejador", "planejador_leitura"];

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
    await baixarPlanilhaSemAgendamento({ notas, resumo, desde, ate, arquivo: `notas-recebidas-sem-agendamento-${desde}-a-${ate}.xlsx` });
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
        <DashboardSemAgendamento resumo={resumo} periodo={{ desde, ate }} />
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
                  {COLUNAS_DA_NOTA.map(coluna => <th key={coluna} className="px-4 py-4">{coluna}</th>)}
                </tr>
              </thead>
              <tbody>
                {notas.length ? notas.map(nota => {
                  const linha = linhaDaNota(nota);
                  return (
                    <tr key={nota.id} className="border-t border-line text-sm text-ink-soft">
                      {COLUNAS_DA_NOTA.map(coluna => (
                        <td key={coluna} className={`px-4 py-4 ${coluna === "Fornecedor" ? "font-bold text-rvd-plum" : ""} ${coluna === "Nota fiscal" ? "font-display font-extrabold text-ink" : ""}`}>{linha[coluna]}</td>
                      ))}
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={COLUNAS_DA_NOTA.length} className="px-5 py-16 text-center">
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
