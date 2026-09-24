import { Button } from "@/components/ui/button";
import { cartazDaPortariaFileName, gerarCartazDaPortaria, PASSOS_DO_CARTAZ } from "@/lib/cartazDaPortaria";
import { QrCode, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * O cartaz do portão, em PDF.
 *
 * Fornecedor que chega sem agendar quase nunca é má vontade: é gente que não
 * sabe que o portal existe. Explicar isso motorista por motorista depende de
 * quem está na guarita ter tempo e lembrar do endereço — o cartaz resolve de
 * uma vez, e quem chegou errado hoje já sai sabendo agendar a próxima.
 */
export default function CartazDaPortariaCard() {
  const [gerando, setGerando] = useState(false);

  const baixar = async () => {
    setGerando(true);
    try {
      // O endereço vem de onde esta página está sendo servida: escrito à mão,
      // ficaria para trás no dia em que o portal mudasse de endereço.
      const doc = await gerarCartazDaPortaria(window.location.origin);
      doc.save(cartazDaPortariaFileName());
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível gerar o cartaz.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <section className="panel p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum">
            <QrCode className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Divulgação</p>
            <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Cartaz para a portaria</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">
              Uma folha A4 com o QR do portal para imprimir e deixar no portão. O motorista aponta a
              câmera e já se cadastra — sem ninguém precisar ditar endereço.
            </p>
            <ol className="mt-4 grid gap-1.5 sm:grid-cols-2">
              {PASSOS_DO_CARTAZ.map((passo, indice) => (
                <li key={passo.titulo} className="flex items-start gap-2 text-[13px] text-ink-soft">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-rvd-plum-pale text-[10px] font-bold text-rvd-plum">{indice + 1}</span>
                  {passo.titulo}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs leading-5 text-ink-faint">
              O endereço impresso é o deste portal, lido na hora de gerar — se ele mudar, basta
              imprimir de novo.
            </p>
          </div>
        </div>
        <Button onClick={baixar} disabled={gerando} className="h-11 shrink-0 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand">
          <Printer className="size-4" />
          {gerando ? "Gerando..." : "Baixar o cartaz"}
        </Button>
      </div>
    </section>
  );
}
