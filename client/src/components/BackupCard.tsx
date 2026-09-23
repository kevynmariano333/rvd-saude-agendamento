import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Clock, DatabaseBackup, ShieldCheck } from "lucide-react";
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

  const backup = trpc.manutencao.gerarBackup.useMutation({
    onSuccess: dados => {
      setResumo(dados);
      void utils.manutencao.situacaoDoBackup.invalidate();
      toast.success("Backup gravado no armazenamento.");
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
        <Button
          onClick={() => backup.mutate()}
          disabled={backup.isPending}
          className="h-11 shrink-0 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand"
        >
          {backup.isPending ? "Gerando..." : "Gerar backup agora"}
        </Button>
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
          <p className="mt-4 text-xs leading-5 text-ink-faint">
            Para conferir, abra o bucket no Cloudflare R2 e procure a pasta <code>backups/</code>.
          </p>
        </div>
      )}
    </section>
  );
}
