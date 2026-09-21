import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { DatabaseBackup, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Resumo = {
  chave: string;
  geradoEm: string;
  totalLinhas: number;
  tamanhoBytes: number;
  tabelas: { tabela: string; linhas: number }[];
};

/**
 * Backup do banco a um clique.
 *
 * O caminho normal — painel do provedor ou mysqldump — depende de permissões e
 * de programas que quem administra o sistema não tem. Um backup que exige tudo
 * isso nunca é feito, e o banco é o único dado que não existe em nenhum outro
 * lugar.
 */
export default function BackupCard() {
  const [resumo, setResumo] = useState<Resumo | null>(null);

  const backup = trpc.manutencao.gerarBackup.useMutation({
    onSuccess: dados => {
      setResumo(dados);
      toast.success("Backup gravado no armazenamento.");
    },
    onError: erro => toast.error(erro.message),
  });

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
              Grava uma cópia de todas as tabelas no armazenamento de arquivos, que fica em outro
              provedor. Vale fazer antes de qualquer operação grande — e de vez em quando, sem
              motivo nenhum.
            </p>
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
