import { trpc } from "@/lib/trpc";
import { definirUnidades, UNIDADES, type Unidade } from "@shared/recipients";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Põe no ar o cadastro de unidades que está no banco.
 *
 * A tela traz uma lista embutida no arquivo, que é a do último deploy, e
 * começa a desenhar com ela — esperar o servidor responder para mostrar
 * qualquer coisa atrasaria até a tela de login, que não usa unidade nenhuma.
 * Quando a lista do banco chega diferente da embutida, a árvore é remontada
 * para as telas lerem a nova. Igual, que é o caso de todo dia, nada acontece.
 */
export default function RegistroDeUnidades({ children }: { children: ReactNode }) {
  const { data } = trpc.unidades.lista.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!data) return;
    const mudou = JSON.stringify(data) !== JSON.stringify(UNIDADES);
    definirUnidades(data as Unidade[]);
    if (mudou) setVersao(atual => atual + 1);
  }, [data]);

  return <div key={versao} className="contents">{children}</div>;
}
