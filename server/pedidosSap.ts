import * as XLSX from "xlsx";
import { UNIDADES } from "../shared/recipients";

/**
 * Leitura do relatório de pedidos de compra do SAP.
 *
 * O arquivo é a foto dos pedidos em aberto: uma linha por item de pedido, com o
 * material, a quantidade pedida, o que ainda falta fornecer e para qual centro.
 * É o que permite a nota se conferir contra a compra que a originou.
 */

/** O centro do SAP e a unidade que ele representa aqui. */
export const CENTROS: Record<string, string> = {
  "1273": "MSH",
  "1235": "HSH",
};

/** As colunas do relatório, na ordem em que o SAP exporta. */
export const CABECALHO_DO_SAP = [
  "Histórico pedido/docum.SolRem.",
  "Documento de compras",
  "Item",
  "Tipo doc.compras",
  "Centro",
  "Ctg.doc.compras",
  "Data do documento",
  "Fornecedor/centro fornecedor",
  "Material Pai",
  "Texto breve",
] as const;

export type ItemDePedido = {
  purchaseOrder: string;
  item: string;
  sapCode: string | null;
  description: string | null;
  recipientCnpj: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  orderedQuantity: string | null;
  pendingQuantity: string | null;
  unitPriceCents: number | null;
  totalCents: number | null;
  documentDate: Date | null;
};

export type RecusaDeLinha = { linha: number; motivo: string };

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const bruto = typeof valor === "number" ? valor : Number(String(valor).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(bruto) ? bruto : null;
}

/** Centavos, arredondados: o SAP manda o preço com duas casas. */
function centavos(valor: unknown): number | null {
  const bruto = numero(valor);
  return bruto === null ? null : Math.round(bruto * 100);
}

/** Quantidade como texto, para o decimal do banco não perder casa no caminho. */
function quantidade(valor: unknown): string | null {
  const bruto = numero(valor);
  return bruto === null ? null : bruto.toFixed(3);
}

/**
 * A data do documento vem como número de série do Excel.
 *
 * O zero do Excel é 30/12/1899, e não 01/01/1900 — o formato carrega um ano
 * bissexto que nunca existiu. Usar a data errada jogaria todo o relatório dois
 * dias para trás.
 */
export function dataDoSerial(valor: unknown): Date | null {
  const serial = numero(valor);
  if (serial === null || serial <= 0) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
}

/**
 * O CNPJ da unidade que recebe, a partir do centro do SAP.
 *
 * Centro desconhecido devolve nulo em vez de chutar uma unidade: a conferência
 * de destino só vale se ela estiver certa.
 */
export function cnpjDoCentro(centro: string): string | null {
  const sigla = CENTROS[texto(centro)];
  if (!sigla) return null;
  return UNIDADES.find(unidade => unidade.sigla === sigla)?.cnpj ?? null;
}

/**
 * O fornecedor vem como "código  razão social" num campo só.
 *
 * Separar os dois deixa o código utilizável para cruzar com o ERP e o nome
 * legível na tela.
 */
export function separarFornecedor(valor: string): { codigo: string | null; nome: string | null } {
  const bruto = texto(valor);
  if (!bruto) return { codigo: null, nome: null };
  const casado = bruto.match(/^(\d+)\s+(.*)$/);
  if (!casado) return { codigo: null, nome: bruto };
  return { codigo: casado[1], nome: casado[2].trim() || null };
}

/** As linhas do relatório, prontas para gravar, e o que foi recusado. */
export function lerPedidosDoSap(conteudo: Buffer): { itens: ItemDePedido[]; recusas: RecusaDeLinha[] } {
  const planilha = XLSX.read(conteudo, { type: "buffer" });
  const primeira = planilha.SheetNames[0];
  if (!primeira) throw new Error("A planilha não tem nenhuma aba.");
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(planilha.Sheets[primeira], { header: 1, blankrows: false });
  if (!linhas.length) throw new Error("A planilha está vazia.");

  const cabecalho = (linhas[0] as unknown[]).map(texto);
  const faltando = CABECALHO_DO_SAP.filter(esperada => !cabecalho.includes(esperada));
  if (faltando.length) {
    throw new Error(`A planilha não parece o relatório de pedidos do SAP. Faltam as colunas: ${faltando.join(", ")}.`);
  }
  // Lidas pelo nome, e não pela posição: o SAP acrescenta coluna com o tempo, e
  // uma coluna nova no meio trocaria material por preço sem ninguém perceber.
  const onde = (nome: string) => cabecalho.indexOf(nome);
  const col = {
    pedido: onde("Documento de compras"),
    item: onde("Item"),
    centro: onde("Centro"),
    data: onde("Data do documento"),
    fornecedor: onde("Fornecedor/centro fornecedor"),
    material: onde("Material Pai"),
    descricao: onde("Texto breve"),
    preco: onde("Preço líquido"),
    quantidade: onde("Qtd.pedido"),
    pendente: onde("a ser fornecida (quantidade)"),
    total: onde("Valor líquido pedido"),
  };

  const itens: ItemDePedido[] = [];
  const recusas: RecusaDeLinha[] = [];
  const vistos = new Set<string>();

  linhas.slice(1).forEach((bruta, indice) => {
    const numeroDaLinha = indice + 2;
    const colunas = bruta as unknown[];
    const pedido = texto(colunas[col.pedido]).replace(/\D/g, "");
    const item = texto(colunas[col.item]);
    if (!pedido || !item) {
      recusas.push({ linha: numeroDaLinha, motivo: "linha sem documento de compras ou sem item" });
      return;
    }
    const chave = `${pedido}|${item}`;
    if (vistos.has(chave)) {
      recusas.push({ linha: numeroDaLinha, motivo: `pedido ${pedido} item ${item} repetido no arquivo` });
      return;
    }
    vistos.add(chave);
    const fornecedor = separarFornecedor(texto(colunas[col.fornecedor]));
    itens.push({
      purchaseOrder: pedido,
      item,
      sapCode: texto(colunas[col.material]) || null,
      description: texto(colunas[col.descricao]).slice(0, 255) || null,
      recipientCnpj: cnpjDoCentro(texto(colunas[col.centro])),
      supplierCode: fornecedor.codigo,
      supplierName: fornecedor.nome?.slice(0, 255) ?? null,
      orderedQuantity: quantidade(colunas[col.quantidade]),
      pendingQuantity: quantidade(colunas[col.pendente]),
      unitPriceCents: centavos(colunas[col.preco]),
      totalCents: centavos(colunas[col.total]),
      documentDate: dataDoSerial(colunas[col.data]),
    });
  });

  return { itens, recusas };
}
