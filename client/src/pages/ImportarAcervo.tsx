import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { homePathFor, type PortalRole } from "@/lib/portal";
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, ListChecks, Play, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

type Relatorio = {
  gravou: boolean;
  linhasConsolidado: number;
  linhasDetalhado: number | null;
  linhasBacklog: number | null;
  importadas: number;
  jaExistentes: number;
  fornecedores: { total: number; criados: number; reaproveitados: number };
  notasComItens: number;
  notasComBacklog: number;
  backlogEmAberto: number;
  episodiosSemNota: number;
  comentarios: number;
  motivosDesconhecidos: { codigo: string; quantidade: number }[];
  porStatus: Record<string, number>;
  avisos: { linha: number; texto: string }[];
  recusas: { linha: number; motivo: string }[];
  semBanco: boolean;
};

const statusEmPortugues: Record<string, string> = {
  pending: "Pendente",
  scheduled: "Agendado",
  received: "Recebido",
  completed: "Concluído",
  backlog: "Backlog",
  rejected: "Rejeitado",
};

/** O arquivo vira base64: os bytes chegam intactos e o servidor decide a codificação. */
function lerBase64(arquivo: File) {
  return new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] || "");
    leitor.onerror = () => reject(new Error(`Não foi possível ler ${arquivo.name}.`));
    leitor.readAsDataURL(arquivo);
  });
}

function CampoDeArquivo({ id, titulo, descricao, obrigatorio, arquivo, onChange }: { id: string; titulo: string; descricao: string; obrigatorio?: boolean; arquivo: File | null; onChange: (arquivo: File | null) => void }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-rvd-plum-pale p-2.5 text-rvd-plum"><FileSpreadsheet className="size-5" /></span>
        <div className="min-w-0">
          <Label htmlFor={id} className="text-sm font-bold text-ink">
            {titulo} {obrigatorio ? <span className="text-state-stop">*</span> : <span className="font-normal text-ink-faint">(opcional)</span>}
          </Label>
          <p className="mt-1 text-xs leading-5 text-ink-soft">{descricao}</p>
        </div>
      </div>
      <Input id={id} type="file" accept=".csv,text/csv" onChange={evento => onChange(evento.target.files?.[0] ?? null)} className="mt-4 cursor-pointer border-line bg-surface text-rvd-plum" />
      {arquivo && <p className="mt-2 truncate text-xs font-bold text-rvd-plum">{arquivo.name} · {(arquivo.size / 1024).toFixed(0)} KB</p>}
    </div>
  );
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string | number; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl px-5 py-4 ${destaque ? "bg-brand text-white" : "bg-sunken"}`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.13em] ${destaque ? "text-on-brand-soft" : "text-ink-faint"}`}>{rotulo}</p>
      <p className={`mt-1 font-display text-2xl font-extrabold ${destaque ? "text-white" : "text-ink"}`}>{valor}</p>
    </div>
  );
}

function ListaDeOcorrencias({ titulo, itens, tom }: { titulo: string; itens: { linha: number; texto: string }[]; tom: "aviso" | "recusa" }) {
  const [tudo, setTudo] = useState(false);
  if (!itens.length) return null;
  const mostrados = tudo ? itens : itens.slice(0, 15);
  return (
    <section className="mt-6">
      <h3 className={`flex items-center gap-2 text-sm font-extrabold ${tom === "recusa" ? "text-state-stop" : "text-rvd-plum"}`}>
        <AlertTriangle className="size-4" />
        {titulo} ({itens.length})
      </h3>
      <ul className="mt-3 space-y-1.5">
        {mostrados.map(item => (
          <li key={`${item.linha}-${item.texto}`} className="rounded-xl bg-sunken px-4 py-2.5 text-xs leading-5 text-ink-soft">
            <span className="font-bold text-rvd-plum">linha {item.linha}</span> · {item.texto}
          </li>
        ))}
      </ul>
      {itens.length > mostrados.length && (
        <Button variant="ghost" onClick={() => setTudo(true)} className="mt-2 h-9 text-xs font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">
          Ver as outras {itens.length - mostrados.length}
        </Button>
      )}
    </section>
  );
}

/**
 * Importação do acervo do sistema anterior, pela tela.
 *
 * O mesmo trabalho existe como script de linha de comando, mas script depende
 * de abrir o console do provedor — e o que depende disso não acontece. Aqui o
 * administrador manda os CSVs, vê o que vai entrar e só então confirma.
 */
export default function ImportarAcervo() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const ehAdmin = auth.data?.role === "admin";
  const [consolidado, setConsolidado] = useState<File | null>(null);
  const [detalhado, setDetalhado] = useState<File | null>(null);
  const [backlog, setBacklog] = useState<File | null>(null);
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [preparando, setPreparando] = useState(false);
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });

  const importar = trpc.manutencao.importarAcervo.useMutation({
    onSuccess: dados => {
      setRelatorio(dados as Relatorio);
      if (dados.gravou) toast.success(`${dados.importadas} nota(s) importada(s).`);
      else toast.success("Simulação concluída. Nada foi gravado.");
    },
    onError: erro => toast.error(erro.message),
  });

  useEffect(() => {
    if (auth.data && auth.data.role !== "admin") setLocation(homePathFor(auth.data.role as PortalRole));
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  if (!auth.data || !ehAdmin) return <div className="min-h-screen bg-canvas" />;

  const enviar = async (confirmar: boolean) => {
    if (!consolidado) return toast.error("Selecione ao menos o relatório consolidado.");
    setPreparando(true);
    try {
      importar.mutate({
        consolidado: await lerBase64(consolidado),
        detalhado: detalhado ? await lerBase64(detalhado) : null,
        backlog: backlog ? await lerBase64(backlog) : null,
        confirmar,
      });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ler os arquivos.");
    } finally {
      setPreparando(false);
    }
  };

  const ocupado = preparando || importar.isPending;
  const simulou = Boolean(relatorio && !relatorio.gravou);

  return (
    <PortalLayout user={auth.data} title="Importar acervo" subtitle="Traga para o portal o histórico exportado do sistema anterior." onLogout={() => logout.mutate()}>
      <section className="overflow-hidden rounded-3xl bg-[#172136] p-6 text-white shadow-xl shadow-rvd-plum/10 sm:p-8">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-on-brand"><Database className="size-7" /></span>
          <div>
            <p className="font-display text-3xl font-extrabold">Importar acervo</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-white/75">
              Envie os relatórios exportados do sistema anterior. A simulação mostra exatamente o que entraria, sem gravar nada;
              a gravação só acontece quando você confirmar. Rodar de novo não duplica: nota que já existe é pulada.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        <CampoDeArquivo id="csv-consolidado" titulo="Consolidado" obrigatorio descricao="Uma linha por nota: datas, status, pedido, fornecedor e destino." arquivo={consolidado} onChange={setConsolidado} />
        <CampoDeArquivo id="csv-detalhado" titulo="Detalhado" descricao="Uma linha por item: descrição, código do material no SAP, quantidade e valores." arquivo={detalhado} onChange={setDetalhado} />
        <CampoDeArquivo id="csv-backlog" titulo="Backlog" descricao="Uma linha por episódio: motivo, entrada, saída e comentários da equipe." arquivo={backlog} onChange={setBacklog} />
      </div>

      <section className="mt-6 flex flex-wrap items-center gap-3 rounded-3xl bg-sunken p-5 sm:p-6">
        <Button onClick={() => enviar(false)} disabled={ocupado || !consolidado} className="h-12 rounded-xl bg-brand px-6 font-bold text-white hover:bg-brand/90">
          <ListChecks className="size-4" />
          {ocupado && !importar.variables?.confirmar ? "Conferindo..." : "Simular importação"}
        </Button>
        <Button onClick={() => enviar(true)} disabled={ocupado || !simulou} className="h-12 rounded-xl bg-rvd-blue px-6 font-bold text-rvd-plum hover:bg-rvd-blue-pale">
          <Play className="size-4" />
          {ocupado && importar.variables?.confirmar ? "Importando..." : "Confirmar e gravar"}
        </Button>
        <p className="text-xs leading-5 text-ink-soft">
          {simulou ? "Confira os números abaixo antes de gravar." : "A gravação libera depois da simulação."}
          {" "}A importação de alguns milhares de notas leva cerca de um minuto.
        </p>
      </section>

      {relatorio && (
        <section className="mt-7 panel p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
              {relatorio.gravou ? <CheckCircle2 className="size-5 text-state-go" /> : <Upload className="size-5 text-rvd-plum" />}
              {relatorio.gravou ? "Importação concluída" : "Simulação — nada foi gravado"}
            </h2>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">
              {relatorio.linhasConsolidado} linhas no consolidado
              {relatorio.linhasDetalhado !== null && ` · ${relatorio.linhasDetalhado} no detalhado`}
              {relatorio.linhasBacklog !== null && ` · ${relatorio.linhasBacklog} no backlog`}
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo={relatorio.gravou ? "Notas importadas" : "Notas a importar"} valor={relatorio.importadas} destaque />
            <Numero rotulo="Já existiam" valor={relatorio.jaExistentes} />
            <Numero rotulo="Recusadas" valor={relatorio.recusas.length} />
            <Numero rotulo="Fornecedores" valor={`${relatorio.fornecedores.total}`} />
            <Numero rotulo="Notas com itens" valor={relatorio.notasComItens} />
            <Numero rotulo="Passaram pelo backlog" valor={relatorio.notasComBacklog} />
            <Numero rotulo="Backlog ainda aberto" valor={relatorio.backlogEmAberto} />
            <Numero rotulo="Comentários" valor={relatorio.comentarios} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {Object.entries(relatorio.porStatus).map(([status, quantidade]) => (
              <span key={status} className="inline-flex items-center gap-2 rounded-full bg-rvd-plum-pale px-4 py-2 text-xs font-bold text-rvd-plum">
                {statusEmPortugues[status] ?? status}
                <span className="font-display text-sm font-extrabold">{quantidade}</span>
              </span>
            ))}
          </div>

          {relatorio.episodiosSemNota > 0 && (
            <p className="mt-4 rounded-xl bg-sunken px-4 py-3 text-xs leading-5 text-ink-soft">
              {relatorio.episodiosSemNota} episódio(s) de backlog não têm nota correspondente no consolidado e ficaram de fora.
            </p>
          )}
          {relatorio.motivosDesconhecidos.length > 0 && (
            <p className="mt-3 rounded-xl bg-sunken px-4 py-3 text-xs leading-5 text-ink-soft">
              Motivos sem correspondência na lista do portal, gravados só na descrição:{" "}
              {relatorio.motivosDesconhecidos.map(motivo => `${motivo.codigo} (${motivo.quantidade})`).join(", ")}.
            </p>
          )}

          <ListaDeOcorrencias titulo="Recusadas" tom="recusa" itens={relatorio.recusas.map(recusa => ({ linha: recusa.linha, texto: recusa.motivo }))} />
          <ListaDeOcorrencias titulo="Avisos" tom="aviso" itens={relatorio.avisos} />
        </section>
      )}
    </PortalLayout>
  );
}
