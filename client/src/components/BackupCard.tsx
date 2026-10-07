import { Button } from "@/components/ui/button";
import { statusCopy, type PortalStatus } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Clock, DatabaseBackup, Download, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Resumo = {
  chave: string;
  geradoEm: string;
  totalLinhas: number;
  tamanhoBytes: number;
  tabelas: { tabela: string; linhas: number }[];
};

const quando = (valor: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor));

/** Dois dias sem cópia é hora de alguém olhar, não de confiar no silêncio. */
const LIMITE_DE_ATRASO_MS = 48 * 60 * 60 * 1000;

/**
 * A prova de que a cópia da madrugada está saindo.
 *
 * Backup automático sem esta linha é pior do que não ter: quem administra passa
 * a acreditar que está protegido, e só descobre que parou de rodar no dia em
 * que precisar restaurar.
 */
function SituacaoDoBackup({ ultimo, falha }: { ultimo: { finishedAt: Date | string | null; origin: string; rowCount: number | null } | null; falha: string | null }) {
  if (falha) {
    return (
      <p className="flex items-start gap-2 text-[13px] font-bold text-state-stop">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>A última tentativa falhou: {falha}</span>
      </p>
    );
  }
  if (!ultimo?.finishedAt) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-ink-soft">
        <Clock className="size-4 shrink-0" />
        Nenhuma cópia gravada ainda. A primeira sai na próxima madrugada.
      </p>
    );
  }
  const atrasado = Date.now() - new Date(ultimo.finishedAt).getTime() > LIMITE_DE_ATRASO_MS;
  return (
    <p className={`flex items-start gap-2 text-[13px] font-bold ${atrasado ? "text-state-stop" : "text-state-go"}`}>
      {atrasado ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0" />}
      <span>
        Última cópia: {quando(ultimo.finishedAt)} ({ultimo.origin})
        {ultimo.rowCount === null ? "" : ` · ${ultimo.rowCount.toLocaleString("pt-BR")} registros`}
        {atrasado ? " — passou de dois dias, vale conferir." : ""}
      </span>
    </p>
  );
}


const contar = (quantos: number, singular: string, plural: string) => `${quantos} ${quantos === 1 ? singular : plural}`;

type CopiaGuardada = { id: number; finishedAt: Date | string | null; origin: string; storageKey: string | null };

/**
 * Trazer de volta uma nota que alguém apagou sem querer.
 *
 * Apagar uma nota é definitivo: o banco leva junto, em cascata, o histórico, a
 * conversa com o fornecedor, as notas internas e as sugestões. Não há lixeira.
 * O que há é a cópia da madrugada — que até aqui só servia para baixar o
 * arquivo, o que não devolve nada para dentro do sistema.
 *
 * Procurar vem antes de restaurar, e separado: o número da nota sozinho não
 * distingue a que foi apagada da homônima de outro fornecedor, e recolocar a
 * errada é mais um estrago, não menos.
 */
function RestaurarNotaApagada({ copias }: { copias: CopiaGuardada[] }) {
  const [chave, setChave] = useState("");
  const [numeroDaNota, setNumeroDaNota] = useState("");
  const utils = trpc.useUtils();

  const comArquivo = copias.filter(copia => copia.storageKey);
  const escolhida = chave || comArquivo[0]?.storageKey || "";

  const procurar = trpc.manutencao.procurarNotaNoBackup.useMutation({
    onError: erro => toast.error(erro.message),
  });

  const restaurar = trpc.manutencao.restaurarNotaDoBackup.useMutation({
    onSuccess: dados => {
      toast.success(`Nota de volta no sistema, com a conversa e o histórico (${dados.linhas.reduce((soma, linha) => soma + linha.linhas, 0)} registros).`);
      void utils.appointments.invalidate();
      if (escolhida && numeroDaNota.trim()) procurar.mutate({ chave: escolhida, numeroDaNota: numeroDaNota.trim() });
    },
    onError: erro => toast.error(erro.message),
  });

  const achadas = procurar.data?.notas ?? [];

  if (!comArquivo.length) return null;

  return (
    <div className="mt-6 rounded-2xl border border-line bg-canvas p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Restaurar uma nota apagada</p>
      <p className="mt-2 max-w-2xl text-[13px] leading-5 text-ink-soft">
        Apagar uma nota leva junto o histórico, a conversa com o fornecedor e as notas internas —
        não existe lixeira. O que existe é a cópia da madrugada: procure a nota dentro dela e ela
        volta para o sistema com o mesmo número, a conversa e o histórico. O que mudou na nota
        depois da cópia não volta.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">De qual cópia</span>
          <select
            value={escolhida}
            onChange={evento => setChave(evento.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-rvd-plum"
          >
            {comArquivo.map(copia => (
              <option key={copia.id} value={copia.storageKey!}>
                {copia.finishedAt ? quando(copia.finishedAt) : "sem data"} ({copia.origin === "manual" ? "manual" : "automático"})
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[10rem] flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">Número da nota</span>
          <input
            value={numeroDaNota}
            onChange={evento => setNumeroDaNota(evento.target.value)}
            onKeyDown={evento => {
              if (evento.key === "Enter" && escolhida && numeroDaNota.trim()) procurar.mutate({ chave: escolhida, numeroDaNota: numeroDaNota.trim() });
            }}
            placeholder="8507"
            maxLength={100}
            className="mt-1.5 h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-rvd-plum"
          />
        </label>
        <Button
          onClick={() => procurar.mutate({ chave: escolhida, numeroDaNota: numeroDaNota.trim() })}
          disabled={procurar.isPending || !escolhida || !numeroDaNota.trim()}
          variant="outline"
          className="h-11 rounded-xl border-line bg-surface px-5 font-bold text-rvd-plum hover:bg-rvd-plum-pale"
        >
          <Search className="size-4" />
          {procurar.isPending ? "Procurando..." : "Procurar na cópia"}
        </Button>
      </div>

      {procurar.isSuccess && !achadas.length && (
        <p className="mt-4 text-[13px] font-bold text-state-stop">
          Nenhuma nota com esse número nesta cópia. Tente uma cópia mais antiga — ou confira o número.
        </p>
      )}

      {achadas.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {achadas.map(nota => (
            <li key={nota.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0">
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-ink">
                  NF {nota.numeroDaNota} · {nota.fornecedor}
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-soft">
                  estava como {statusCopy[nota.status as PortalStatus] ?? nota.status} · {contar(nota.mensagens, "mensagem", "mensagens")} · {contar(nota.historico, "linha de histórico", "linhas de histórico")}
                </span>
              </span>
              {nota.jaExiste ? (
                <span className="shrink-0 text-[12px] font-bold text-ink-faint">Já está no sistema</span>
              ) : (
                <Button
                  onClick={() => restaurar.mutate({ chave: escolhida, appointmentId: nota.id })}
                  disabled={restaurar.isPending}
                  className="h-9 shrink-0 rounded-xl bg-brand px-3.5 text-xs font-bold text-white hover:bg-brand"
                >
                  <RotateCcw className="size-3.5" />
                  {restaurar.isPending ? "Restaurando..." : "Restaurar"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Backup do banco: sozinho todo dia, e a um clique quando precisar.
 *
 * O caminho normal — painel do provedor ou mysqldump — depende de permissões e
 * de programas que quem administra o sistema não tem. Um backup que exige tudo
 * isso nunca é feito, e o banco é o único dado que não existe em nenhum outro
 * lugar.
 */
export default function BackupCard() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const situacao = trpc.manutencao.situacaoDoBackup.useQuery();
  const utils = trpc.useUtils();

  const copias = trpc.manutencao.backupsParaBaixar.useQuery();

  /**
   * Baixar a cópia no computador de quem administra.
   *
   * O backup saía todo dia e parava no bucket. Para pegar o arquivo era preciso
   * ter conta no provedor de armazenamento — que quem administra o sistema não
   * tem —, e backup que o dono não consegue baixar é metade de um backup: dá
   * para restaurar de dentro, não dá para levar os dados embora.
   *
   * O link vem assinado e expira; a navegação para ele é que puxa o arquivo.
   */
  const baixar = trpc.manutencao.linkDoBackup.useMutation({
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: erro => toast.error(erro.message),
  });

  const backup = trpc.manutencao.gerarBackup.useMutation({
    onSuccess: dados => {
      setResumo(dados);
      void utils.manutencao.situacaoDoBackup.invalidate();
      void utils.manutencao.backupsParaBaixar.invalidate();
      toast.success("Backup gravado. Já dá para baixar aqui embaixo.");
    },
    onError: erro => {
      void utils.manutencao.situacaoDoBackup.invalidate();
      toast.error(erro.message);
    },
  });

  // A falha só vale como aviso enquanto for mais recente que a última cópia:
  // depois de um backup bem-sucedido, o erro de ontem virou história.
  const tentativas = situacao.data?.tentativas ?? [];
  const ultimaTentativa = tentativas[0];
  const falhaAtual = ultimaTentativa?.error && !ultimaTentativa.finishedAt ? ultimaTentativa.error : null;

  const mb = resumo ? (resumo.tamanhoBytes / 1024 / 1024).toFixed(2) : null;
  const disponiveis = copias.data ?? [];
  const maisRecente = disponiveis[0] ?? null;

  return (
    <section className="panel p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum">
            <DatabaseBackup className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Manutenção</p>
            <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Backup do banco</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">
              Uma cópia de todas as tabelas vai para o armazenamento de arquivos, que fica em
              outro provedor. Isso acontece sozinho todo dia de madrugada; o botão ao lado serve
              para gerar uma agora, antes de alguma operação grande.
            </p>
            <div className="mt-3">
              <SituacaoDoBackup ultimo={situacao.data?.ultimo ?? null} falha={falhaAtual} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            onClick={() => backup.mutate()}
            disabled={backup.isPending}
            className="h-11 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand"
          >
            {backup.isPending ? "Gerando..." : "Gerar backup agora"}
          </Button>
          {maisRecente?.storageKey && (
            <Button
              onClick={() => baixar.mutate({ chave: maisRecente.storageKey! })}
              disabled={baixar.isPending}
              variant="outline"
              className="h-11 rounded-xl border-line bg-surface px-5 font-bold text-rvd-plum hover:bg-rvd-plum-pale"
            >
              <Download className="size-4" />
              {baixar.isPending ? "Preparando..." : "Baixar a última"}
            </Button>
          )}
        </div>
      </div>

      {resumo && (
        <div className="mt-6 rounded-2xl border border-line bg-canvas p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-state-go">
            <ShieldCheck className="size-4" />
            {resumo.totalLinhas.toLocaleString("pt-BR")} registros salvos · {mb} MB
          </p>
          <p className="mt-2 break-all text-xs text-ink-soft">
            Arquivo: <span className="font-mono">{resumo.chave}</span>
          </p>
          <ul className="mt-4 grid gap-1 sm:grid-cols-2">
            {resumo.tabelas.map(t => (
              <li key={t.tabela} className="flex justify-between gap-3 text-xs text-ink-soft">
                <span className="truncate font-medium text-ink">{t.tabela}</span>
                <span>{t.linhas.toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {disponiveis.length > 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-canvas p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Cópias guardadas</p>
          <p className="mt-2 text-[13px] leading-5 text-ink-soft">
            Cada arquivo é o banco inteiro — todas as tabelas, todas as linhas — em JSON compactado
            (<code>.json.gz</code>). Abre em qualquer editor depois de descompactar, e serve tanto para
            guardar fora do sistema quanto para restaurar.
          </p>
          <ul className="mt-4 divide-y divide-line">
            {disponiveis.map(copia => (
              <li key={copia.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0">
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-ink">
                    {copia.finishedAt ? quando(copia.finishedAt) : "—"}
                    <span className="ml-2 rounded bg-rvd-plum-pale px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rvd-plum">
                      {copia.origin === "manual" ? "manual" : "automático"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-soft">
                    {(copia.rowCount ?? 0).toLocaleString("pt-BR")} registros · {((copia.sizeBytes ?? 0) / 1024 / 1024).toFixed(2)} MB
                  </span>
                </span>
                <Button
                  onClick={() => copia.storageKey && baixar.mutate({ chave: copia.storageKey })}
                  disabled={baixar.isPending}
                  variant="outline"
                  className="h-9 shrink-0 rounded-xl border-line bg-surface px-3.5 text-xs font-bold text-rvd-plum hover:bg-rvd-plum-pale"
                >
                  <Download className="size-3.5" />
                  Baixar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RestaurarNotaApagada copias={disponiveis} />
    </section>
  );
}
