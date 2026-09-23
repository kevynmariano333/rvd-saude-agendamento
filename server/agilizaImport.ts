/**
 * Importação do acervo de recebimento do sistema Agiliza.
 *
 * O Agiliza é o sistema da empresa parceira, e a RVD Saúde exportou de lá o que
 * é dela. São três relatórios, e cada um traz uma parte do que a nota precisa:
 *
 *   consolidado  uma linha por nota: datas, status, pedido, fornecedor, destino
 *   detalhado    uma linha por item: descrição, código SAP do material, valores
 *   backlog      uma linha por episódio: motivo, entrada, saída e comentários
 *
 * Só o consolidado é obrigatório; os outros dois entram por opção e enriquecem
 * as mesmas notas. Rodar de novo com um arquivo a mais NÃO completa as notas já
 * importadas — a idempotência é por nota, e nota que já existe é pulada. Então
 * mande de uma vez o que tiver.
 *
 * Este módulo recebe o CONTEÚDO dos relatórios, e não caminhos de arquivo: é o
 * mesmo código servindo a tela de administração (onde o arquivo chega pelo
 * navegador) e o script de linha de comando. Duas leituras diferentes do mesmo
 * CSV seriam duas chances de importar coisas diferentes.
 *
 * O "Cód. SAP" do detalhado é o código do material, e não o número MIRO: ele
 * muda de item para item dentro da mesma nota. Fica com o item; miroNumber
 * continua vazio nas notas importadas, porque esse número o acervo não tem.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { z } from "zod";
import {
  appointmentInternalNotes,
  appointments,
  appointmentStatusHistory,
  users,
  type AppointmentStatus,
} from "../drizzle/schema";

// ---------------------------------------------------------------------------
// Constantes do acervo
// ---------------------------------------------------------------------------

/**
 * Os dois destinos reais da RVD. Aparecem em 3.712 das 3.725 linhas; o resto é
 * sujeira de digitação da origem. Servem para duas coisas: reconstruir um CNPJ
 * de destino truncado e impedir que o CNPJ da própria RVD entre como se fosse
 * de um fornecedor — se isso acontecesse, qualquer pessoa que se cadastrasse
 * informando o CNPJ (que é público) do hospital passaria a enxergar o acervo
 * pelo agrupamento por empresa.
 */
const CNPJS_DA_RVD = new Map<string, string>([
  ["06033403000113", "HSH - HOSPITAL"],
  ["43293604002120", "MSH - MATERN."],
]);

/** O "Último Status" do Agiliza vem acentuado; comparar sem acento não casa nada. */
export const STATUS_AGILIZA = {
  Concluída: "completed",
  Recebida: "received",
  // Nota que ainda vai ser entregue: entra agendada e aparece na agenda do
  // Operador como qualquer outra, que é o ponto de trazer o acervo para cá.
  Agendada: "scheduled",
  Backlog: "backlog",
} as const satisfies Record<string, AppointmentStatus>;

const CABECALHO_ITENS = [
  "Número da Nota",
  "Último Status",
  "Data do Último Status",
  "Data de Agendamento",
  "Número do Pedido",
  "CNPJ Fornecedor",
  "Nome Fornecedor",
  "CNPJ Destino",
  "Descrição Destino",
  "Cód. Fornecedor",
  "Descrição do Item",
  "Cód. SAP",
  "Quantidade",
  "Valor Unitário",
  "Valor Total",
] as const;

const CABECALHO_BACKLOG = [
  "Data de Criação",
  "Entrou em Backlog",
  "Saiu do Backlog",
  "Status Atual",
  "Número da Nota",
  "CNPJ Fornecedor",
  "Nome Fornecedor",
  "Cód. SAP",
  "Motivo",
  "Comentários",
] as const;

/**
 * O motivo do backlog no Agiliza e o código da lista fechada daqui.
 *
 * Três pares ficaram ambíguos — "cnpj" e "divergencia_cnpj", "quantidade" e
 * "divergencia_quantidade", e "valor" —, porque a lista daqui tem a divergência
 * simples e a divergência "nota x pedido" para os mesmos assuntos e o arquivo
 * não diz qual é qual. O código curto foi lido como a comparação com o pedido,
 * que é o que "valor" é sem ambiguidade. O código de origem fica escrito na
 * descrição de toda nota importada: se a leitura estiver trocada, o dado não se
 * perdeu, e corrigir é reescrever esta tabela.
 */
export const MOTIVOS_DO_AGILIZA: Record<string, string> = {
  avaliacao_lote_incompleta: "AVALIACAO_LOTE_INCOMPLETA",
  caixaria: "UNIDADE_MEDIDA_CAIXARIA",
  cnpj: "DIVERGENCIA_CNPJ_PEDIDO_NOTA",
  divergencia_cnpj: "DIVERGENCIA_CNPJ",
  divergencia_preco: "DIVERGENCIA_PRECO",
  divergencia_quantidade: "DIVERGENCIA_QUANTIDADE",
  quantidade: "DIVERGENCIA_QUANTIDADE_NOTA_PEDIDO",
  valor: "DIVERGENCIA_VALOR_NOTA_PEDIDO",
  erro_atribuicao_itens: "ERRO_ATRIBUICAO_ITENS",
  erro_erp: "ERRO_SISTEMA_ERP",
  erro_tributario: "ERRO_TRIBUTARIO_FISCAL",
  pedido_compra: "PENDENCIA_PEDIDO_COMPRA",
  outro: "OUTRO",
};

const CABECALHO_ESPERADO = [
  "Data de Criação",
  "Último Status",
  "Data do Último Status",
  "Data de Agendamento",
  "Número da Nota",
  "Número do Pedido",
  "CNPJ Fornecedor",
  "Nome Fornecedor",
  "Total de Linhas",
  "CNPJ Destino",
  "Descrição Destino",
] as const;

const ORIGEM = "Agiliza";
const LOTE_PADRAO = 200;

// ---------------------------------------------------------------------------
// Leitura do CSV
// ---------------------------------------------------------------------------

/**
 * Leitor de CSV próprio, e não um split(";"), porque um ponto-e-vírgula dentro
 * de um nome de fornecedor transformaria a linha inteira em lixo silencioso.
 * O arquivo é ";" com todo campo entre aspas e "" como aspas escapadas.
 */
function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campos: string[] = [];
  let campo = "";
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const caractere = texto[i];
    if (dentroDeAspas) {
      if (caractere === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += caractere;
      }
      continue;
    }
    if (caractere === '"') dentroDeAspas = true;
    else if (caractere === ";") {
      campos.push(campo);
      campo = "";
    } else if (caractere === "\n") {
      campos.push(campo);
      linhas.push(campos);
      campos = [];
      campo = "";
    } else if (caractere !== "\r") campo += caractere;
  }
  if (campo.length || campos.length) {
    campos.push(campo);
    linhas.push(campos);
  }
  return linhas.filter(linha => linha.some(valor => valor.trim().length > 0));
}

// ---------------------------------------------------------------------------
// Conversões
// ---------------------------------------------------------------------------

const PADRAO_DATA = /^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})$/;

/**
 * "16/09/2026, 15:19:06" é hora de São Paulo. O deslocamento é escrito à mão
 * (-03:00, o mesmo que shared/dateFilters.ts usa) porque o script pode rodar num
 * processo em UTC: entregar a string brasileira crua ao construtor de Date
 * jogaria todo o acervo três horas para trás, e o erro não apareceria em
 * nenhum gráfico — nenhuma data do arquivo cai entre 00:00 e 03:00, então
 * nenhuma linha mudaria de dia. Só apareceria na nota aberta, com hora errada.
 */
export function lerDataSaoPaulo(valor: string): Date | null {
  const partes = PADRAO_DATA.exec(valor.trim());
  if (!partes) return null;
  const [, dia, mes, ano, hora, minuto, segundo] = partes.map(Number);
  if (mes < 1 || mes > 12 || hora > 23 || minuto > 59 || segundo > 59) return null;
  const diasDoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  if (dia < 1 || dia > diasDoMes) return null;
  const doisDigitos = (numero: number) => String(numero).padStart(2, "0");
  const data = new Date(
    `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}T${doisDigitos(hora)}:${doisDigitos(minuto)}:${doisDigitos(segundo)}.000-03:00`
  );
  return Number.isNaN(data.getTime()) ? null : data;
}

function soDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

/** Dígitos verificadores do CNPJ. Sem isso, "conferir o tamanho" aprova 06.027.604/0021-20, que não existe. */
function cnpjValido(digitos: string) {
  if (digitos.length !== 14 || /^(\d)\1{13}$/.test(digitos)) return false;
  const verificador = (tamanho: number) => {
    let peso = tamanho - 7;
    let soma = 0;
    for (let i = tamanho; i >= 1; i--) {
      soma += Number(digitos[tamanho - i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return verificador(12) === Number(digitos[12]) && verificador(13) === Number(digitos[13]);
}

/**
 * 18 linhas trazem o CNPJ sem máscara, e elas não perderam só a pontuação:
 * perderam um zero do meio ("0164540900390" para "01645409000390"). Completar
 * com zero à esquerda inventaria uma empresa que não existe, e o histórico
 * dessas notas ficaria preso num CNPJ que nenhum cadastro real vai alcançar —
 * a busca por empresa é igualdade exata. A reconstrução só é aceita quando a
 * reinserção de um único zero produz exatamente um CNPJ já conhecido.
 */
function reconstruirCnpj(curto: string, conhecidos: Set<string>): string | null {
  const candidatos = new Set<string>();
  for (let i = 0; i <= curto.length; i++) {
    const tentativa = `${curto.slice(0, i)}0${curto.slice(i)}`;
    if (tentativa.length === 14 && conhecidos.has(tentativa)) candidatos.add(tentativa);
  }
  return candidatos.size === 1 ? Array.from(candidatos)[0] : null;
}

/**
 * O Agiliza exportou os nomes com entidade HTML crua ("JOHNSON &amp; JOHNSON"),
 * espaço nas bordas e uma aspa solta. Como o nome escolhido vira o nome da
 * empresa no portal e a chave do ranking de fornecedores do painel, duas
 * grafias do mesmo CNPJ partiriam a empresa em duas linhas do relatório.
 */
function limparNome(valor: string) {
  return valor
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

/** "4504851457, 4000249397" — vários pedidos por nota. Vazio vira null, nunca string vazia. */
function lerPedidos(valor: string) {
  const pedidos = valor
    .split(",")
    .map(pedido => pedido.trim())
    .filter(Boolean);
  return pedidos.length ? pedidos.join(", ") : null;
}

type Recusa = { linha: number; motivo: string };
type Aviso = { linha: number; texto: string };

/** "14.626,50" -> 1462650. Centavos, como o resto do sistema guarda dinheiro. */
export function lerDinheiroEmCentavos(valor: string): number | null {
  const limpo = valor.trim().replace(/\./g, "").replace(",", ".");
  if (!limpo || !/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

function lerInteiro(valor: string): number | null {
  const limpo = valor.trim().replace(/\./g, "").replace(",", ".");
  if (!limpo || !/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

const chaveDaNota = (cnpj: string, nota: string) => `${cnpj}|${nota}`;

// ---------------------------------------------------------------------------
// Relatório detalhado: os itens da nota
// ---------------------------------------------------------------------------

/**
 * O item como a tela de detalhamento lê: os quatro primeiros campos são os
 * mesmos que o leitor de XML produz, e é por eles que a tabela de itens
 * funciona sem saber de onde a nota veio. Os dois últimos são do acervo — o
 * código do material no SAP e o código do fornecedor —, guardados porque é o
 * que permite cruzar a nota antiga com o ERP depois.
 */
type ItemDaNota = {
  description: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number | null;
  sapCode: string | null;
  supplierCode: string | null;
};

type ItensDaNota = { itens: ItemDaNota[]; totalCents: number | null; linhas: number };

const LIMITE_DE_ITENS = 50;

function lerItens(conteudo: string): { porNota: Map<string, ItensDaNota>; linhas: number; recusas: Recusa[] } {
  const linhas = lerCsv(semMarcaDeOrdem(conteudo));
  if (!linhas.length) throw new Error("O relatório detalhado está vazio.");
  const cabecalho = linhas[0].map(coluna => coluna.trim());
  if (cabecalho.length !== CABECALHO_ITENS.length || CABECALHO_ITENS.some((esperado, i) => cabecalho[i] !== esperado)) {
    throw new Error(`Cabeçalho inesperado no relatório detalhado.\n  esperado: ${CABECALHO_ITENS.join(" | ")}\n  recebido: ${cabecalho.join(" | ")}`);
  }

  const porNota = new Map<string, ItensDaNota>();
  const recusas: Recusa[] = [];
  linhas.slice(1).forEach((colunas, indice) => {
    const numeroDaLinha = indice + 2;
    if (colunas.length !== CABECALHO_ITENS.length) {
      recusas.push({ linha: numeroDaLinha, motivo: `linha de item com ${colunas.length} colunas, esperadas ${CABECALHO_ITENS.length}` });
      return;
    }
    const nota = colunas[0].trim();
    const cnpj = soDigitos(colunas[5]);
    if (!nota || !cnpj) {
      recusas.push({ linha: numeroDaLinha, motivo: "linha de item sem número da nota ou sem CNPJ do fornecedor" });
      return;
    }
    const descricao = limparNome(colunas[10]);
    const item: ItemDaNota = {
      description: descricao || "Item sem descrição na origem",
      quantity: lerInteiro(colunas[12]),
      unitPriceCents: lerDinheiroEmCentavos(colunas[13]),
      totalCents: lerDinheiroEmCentavos(colunas[14]),
      sapCode: colunas[11].trim() || null,
      supplierCode: colunas[9].trim() || null,
    };
    const chave = chaveDaNota(cnpj, nota);
    const atual = porNota.get(chave) ?? { itens: [], totalCents: 0, linhas: 0 };
    atual.linhas += 1;
    // Guardar item demais engorda a linha do banco sem ajudar ninguém: a tela
    // mostra os 50 primeiros. O total continua somando todos.
    if (atual.itens.length < LIMITE_DE_ITENS) atual.itens.push(item);
    atual.totalCents = atual.totalCents === null || item.totalCents === null ? null : atual.totalCents + item.totalCents;
    porNota.set(chave, atual);
  });
  return { porNota, linhas: linhas.length - 1, recusas };
}

// ---------------------------------------------------------------------------
// Relatório de backlog: motivo, datas e comentários
// ---------------------------------------------------------------------------

type ComentarioDoAcervo = { quando: Date | null; autor: string; texto: string };

export type EpisodioDeBacklog = {
  codigoOriginal: string;
  codigo: string | null;
  entrouEm: Date | null;
  saiuEm: Date | null;
  comentarios: ComentarioDoAcervo[];
};

const CABECALHO_DE_COMENTARIO = /\[(\d{2})\/(\d{2})\/(\d{2}) - (\d{2}):(\d{2}) — ([^\]]+)\]/g;

/**
 * Os comentários chegam num campo só, colados, cada um precedido de
 * "[18/09/26 - 13:11 — Fulano]". Separar é o que transforma um paredão de texto
 * em anotações com autor e hora dentro da nota.
 */
export function lerComentarios(bruto: string): ComentarioDoAcervo[] {
  const texto = bruto.replace(/\r/g, "");
  const marcas = Array.from(texto.matchAll(CABECALHO_DE_COMENTARIO));
  if (!marcas.length) {
    const solto = texto.trim();
    return solto ? [{ quando: null, autor: "Autor não identificado", texto: solto }] : [];
  }
  return marcas
    .map((marca, indice) => {
      const inicio = (marca.index ?? 0) + marca[0].length;
      const fim = indice + 1 < marcas.length ? marcas[indice + 1].index ?? texto.length : texto.length;
      const [, dia, mes, ano, hora, minuto, autor] = marca;
      return {
        quando: lerDataSaoPaulo(`${dia}/${mes}/20${ano}, ${hora}:${minuto}:00`),
        autor: limparNome(autor) || "Autor não identificado",
        texto: texto.slice(inicio, fim).replace(/\s+/g, " ").trim(),
      };
    })
    .filter(comentario => comentario.texto.length > 0);
}

function lerBacklog(conteudo: string): { porNota: Map<string, EpisodioDeBacklog>; linhas: number; recusas: Recusa[]; motivosDesconhecidos: Map<string, number> } {
  const linhas = lerCsv(semMarcaDeOrdem(conteudo));
  if (!linhas.length) throw new Error("O relatório de backlog está vazio.");
  const cabecalho = linhas[0].map(coluna => coluna.trim());
  if (cabecalho.length !== CABECALHO_BACKLOG.length || CABECALHO_BACKLOG.some((esperado, i) => cabecalho[i] !== esperado)) {
    throw new Error(`Cabeçalho inesperado no relatório de backlog.\n  esperado: ${CABECALHO_BACKLOG.join(" | ")}\n  recebido: ${cabecalho.join(" | ")}`);
  }

  const porNota = new Map<string, EpisodioDeBacklog>();
  const recusas: Recusa[] = [];
  const motivosDesconhecidos = new Map<string, number>();
  linhas.slice(1).forEach((colunas, indice) => {
    const numeroDaLinha = indice + 2;
    if (colunas.length !== CABECALHO_BACKLOG.length) {
      recusas.push({ linha: numeroDaLinha, motivo: `linha de backlog com ${colunas.length} colunas, esperadas ${CABECALHO_BACKLOG.length}` });
      return;
    }
    const nota = colunas[4].trim();
    const cnpj = soDigitos(colunas[5]);
    if (!nota || !cnpj) {
      recusas.push({ linha: numeroDaLinha, motivo: "linha de backlog sem número da nota ou sem CNPJ do fornecedor" });
      return;
    }
    const codigoOriginal = colunas[8].replace(/^Problema relatado:\s*/i, "").trim().toLowerCase();
    const codigo = MOTIVOS_DO_AGILIZA[codigoOriginal] ?? null;
    if (codigoOriginal && !codigo) motivosDesconhecidos.set(codigoOriginal, (motivosDesconhecidos.get(codigoOriginal) ?? 0) + 1);
    porNota.set(chaveDaNota(cnpj, nota), {
      codigoOriginal,
      codigo,
      entrouEm: lerDataSaoPaulo(colunas[1]),
      saiuEm: lerDataSaoPaulo(colunas[2]),
      comentarios: lerComentarios(colunas[9]),
    });
  });
  return { porNota, linhas: linhas.length - 1, recusas, motivosDesconhecidos };
}

// ---------------------------------------------------------------------------
// Validação da linha
// ---------------------------------------------------------------------------

const DataAgiliza = z
  .string()
  .refine(valor => lerDataSaoPaulo(valor) !== null, "data fora do formato dd/mm/aaaa, hh:mm:ss")
  .transform(valor => lerDataSaoPaulo(valor)!);

const EsquemaLinha = z.object({
  dataCriacao: DataAgiliza,
  ultimoStatus: z.enum(["Concluída", "Recebida", "Agendada", "Backlog"]),
  dataUltimoStatus: DataAgiliza,
  dataAgendamento: DataAgiliza,
  numeroNota: z
    .string()
    .transform(valor => valor.trim())
    .refine(valor => valor.length > 0, "número da nota vazio")
    // Texto, nunca número: "000560114" perderia os zeros da frente.
    .refine(valor => valor.length <= 100, "número da nota não cabe em invoiceNumber (100 caracteres)"),
  numeroPedido: z
    .string()
    .transform(lerPedidos)
    // Truncar um número de pedido é pior do que não ter: vira um pedido errado.
    .refine(valor => valor === null || valor.length <= 100, "lista de pedidos não cabe em purchaseOrder (100 caracteres)"),
  cnpjFornecedor: z
    .string()
    .transform(soDigitos)
    .refine(valor => valor.length > 0, "CNPJ do fornecedor vazio"),
  nomeFornecedor: z
    .string()
    .transform(limparNome)
    .refine(valor => valor.length > 0, "nome do fornecedor vazio")
    .refine(valor => valor.length <= 255, "nome do fornecedor não cabe em companyName (255 caracteres)"),
  totalLinhas: z
    .string()
    .transform(valor => (valor.trim() === "" ? null : Number(valor.trim())))
    .refine(valor => valor === null || (Number.isInteger(valor) && valor >= 0), "total de linhas inválido"),
  cnpjDestino: z.string().transform(soDigitos),
  descricaoDestino: z.string().transform(valor => valor.replace(/\s+/g, " ").trim()),
});

export type LinhaValidada = z.infer<typeof EsquemaLinha>;

type LinhaLida = { numero: number; dados: LinhaValidada };

// ---------------------------------------------------------------------------
// Plano de importação
// ---------------------------------------------------------------------------

export type Evento = {
  anterior: AppointmentStatus | null;
  proximo: AppointmentStatus;
  quando: Date;
  agendadoPara: Date | null;
  nota: string;
};

type PlanoNota = {
  linha: number;
  cnpj: string;
  dados: LinhaValidada;
  status: AppointmentStatus;
  recebidoEm: Date | null;
  destino: string | null;
  eventos: Evento[];
  itens: ItensDaNota | null;
  episodio: EpisodioDeBacklog | null;
};

type PlanoFornecedor = {
  cnpj: string;
  nome: string;
  primeiraCriacao: Date;
  notas: number;
};

/**
 * A cadeia de status que o sistema vivo produziria para uma nota dessas:
 * criação, agendamento, a passagem pelo backlog quando houve, recebimento e
 * conclusão, cada passo respeitando o grafo de server/permissions.ts. Um
 * agendamento sem histórico nenhum é um registro que o portal nunca geraria —
 * o diálogo "Histórico de datas" abriria vazio.
 *
 * Os carimbos são forçados a não retroceder: 72 linhas do arquivo têm
 * agendamento anterior à criação (a maioria por 1 ou 2 segundos de relógio da
 * origem, algumas por dias, porque o Agiliza migrou agendamentos antigos em
 * 23/03/2026). As datas de negócio entram como vieram; só a linha do tempo é
 * ajustada, senão a nota apareceria concluída antes de existir.
 */
export function montarEventos(dados: LinhaValidada, status: AppointmentStatus, episodio: EpisodioDeBacklog | null): Evento[] {
  const eventos: Evento[] = [];
  let ultimoMomento = dados.dataCriacao;
  const emOrdem = (momento: Date) => {
    const ajustado = momento < ultimoMomento ? ultimoMomento : momento;
    ultimoMomento = ajustado;
    return ajustado;
  };

  eventos.push({
    anterior: null,
    proximo: "pending",
    quando: emOrdem(dados.dataCriacao),
    agendadoPara: null,
    nota: `Registro criado no sistema ${ORIGEM}.`,
  });

  eventos.push({
    anterior: "pending",
    proximo: "scheduled",
    quando: emOrdem(dados.dataAgendamento),
    // Só a data nova: com previousScheduledFor preenchido o diálogo rotularia
    // o evento como "Reagendamento", que não foi o que aconteceu.
    agendadoPara: dados.dataAgendamento,
    nota: `Data agendada no sistema ${ORIGEM}.`,
  });
  if (status === "scheduled") return eventos;

  // A passagem pelo backlog só é conhecida quando o relatório de backlog entra
  // junto. Sem ele, a nota concluída conta a história curta: agendada, recebida,
  // concluída — que é o que o consolidado sabe.
  if (episodio) {
    eventos.push({
      anterior: "scheduled",
      proximo: "backlog",
      quando: emOrdem(episodio.entrouEm ?? dados.dataUltimoStatus),
      agendadoPara: null,
      nota: `Nota enviada ao backlog no sistema ${ORIGEM}${episodio.codigoOriginal ? ` (motivo: ${episodio.codigoOriginal})` : ""}.`,
    });
    if (status === "backlog") return eventos;
    if (status === "received") {
      // Voltar do backlog para recebida passa por agendada: é o caminho que o
      // portal permite, e inventar um atalho deixaria o histórico impossível.
      eventos.push({
        anterior: "backlog",
        proximo: "scheduled",
        quando: emOrdem(episodio.saiuEm ?? dados.dataUltimoStatus),
        agendadoPara: null,
        nota: `Backlog resolvido no sistema ${ORIGEM}.`,
      });
      eventos.push({
        anterior: "scheduled",
        proximo: "received",
        quando: emOrdem(dados.dataUltimoStatus),
        agendadoPara: null,
        nota: `Recebimento registrado no sistema ${ORIGEM}.`,
      });
      return eventos;
    }
    eventos.push({
      anterior: "backlog",
      proximo: "completed",
      quando: emOrdem(episodio.saiuEm ?? dados.dataUltimoStatus),
      agendadoPara: null,
      nota: `Backlog tratado e nota concluída no sistema ${ORIGEM}.`,
    });
    return eventos;
  }

  if (status === "backlog") {
    eventos.push({
      anterior: "scheduled",
      proximo: "backlog",
      quando: emOrdem(dados.dataUltimoStatus),
      agendadoPara: null,
      nota: `Nota deixada em backlog no sistema ${ORIGEM}.`,
    });
    return eventos;
  }

  eventos.push({
    anterior: "scheduled",
    proximo: "received",
    quando: emOrdem(dados.dataUltimoStatus),
    agendadoPara: null,
    nota: `Recebimento registrado no sistema ${ORIGEM}.`,
  });
  if (status === "completed") {
    eventos.push({
      anterior: "received",
      proximo: "completed",
      quando: emOrdem(dados.dataUltimoStatus),
      agendadoPara: null,
      nota: `Nota concluída no sistema ${ORIGEM}.`,
    });
  }
  return eventos;
}

function montarObservacao(plano: PlanoNota) {
  const partes = [
    `Histórico importado do sistema ${ORIGEM}.`,
    `Status na origem: ${plano.dados.ultimoStatus}.`,
    `Destino informado: ${plano.dados.descricaoDestino || "não informado"}.`,
  ];
  // "Total de Linhas" é a quantidade de itens da nota e não pode ir para
  // invoiceVolumeCount, que a tela lê como quantidade de volumes.
  if (plano.dados.totalLinhas !== null) partes.push(`Linhas da nota na origem: ${plano.dados.totalLinhas}.`);
  if (plano.itens) {
    partes.push(`Itens trazidos do relatório detalhado: ${plano.itens.linhas}.`);
    // O código do SAP que o acervo tem é o do material, um por item. O MIRO, que
    // é o número do lançamento da nota, o Agiliza não exportou — dizer isso aqui
    // evita que alguém leia o campo vazio como erro da importação.
    partes.push("Código SAP do acervo é o do material, por item; o número MIRO da nota não veio na exportação.");
  }
  if (plano.episodio) {
    const entrada = plano.episodio.entrouEm ? formatarData(plano.episodio.entrouEm) : "data não informada";
    const saida = plano.episodio.saiuEm ? formatarData(plano.episodio.saiuEm) : "ainda em aberto";
    partes.push(`Passou pelo backlog na origem (motivo "${plano.episodio.codigoOriginal || "não informado"}"): entrou em ${entrada}, saiu em ${saida}.`);
  }
  if (plano.destino === null && plano.dados.cnpjDestino) {
    partes.push(`CNPJ de destino da origem não reconhecido e não gravado: ${plano.dados.cnpjDestino}.`);
  }
  return partes.join(" ");
}

/** A descrição do motivo guarda o código como ele veio, que é o dado bruto. */
function montarDescricaoDoMotivo(episodio: EpisodioDeBacklog) {
  const origem = episodio.codigoOriginal || "não informado";
  return episodio.codigo
    ? `Motivo importado do ${ORIGEM} (código de origem: ${origem}).`
    : `Motivo importado do ${ORIGEM} sem correspondência na lista do portal (código de origem: ${origem}).`;
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

/**
 * A mesma construção de server/db.ts, de propósito: é ela que decide em que
 * fuso o mysql2 serializa as datas. Um script "mais correto" que abrisse a
 * conexão com outro fuso gravaria o acervo deslocado em relação a tudo que o
 * portal já escreveu.
 */
async function abrirBanco() {
  // A mesma conexão que o resto do servidor usa. Abrir um pool próprio aqui
  // funcionaria, mas cada importação deixaria um pool aberto até o processo
  // cair — e pela tela a importação é feita dentro do servidor, não num
  // processo que termina em seguida.
  return getDb();
}

type Banco = NonNullable<Awaited<ReturnType<typeof abrirBanco>>>;

/**
 * Um usuário por CNPJ, sem senha e sem e-mail (decisão do dono do sistema): o
 * histórico fica atribuído à empresa, e quando o fornecedor de verdade se
 * cadastrar com aquele CNPJ e for aprovado, o agrupamento por empresa que já
 * existe no portal faz ele enxergar o próprio acervo.
 *
 * O openId é derivado do CNPJ em vez de sorteado como em createLocalUser: é o
 * único índice único que sobra na tabela, e é ele que impede que rodar o script
 * duas vezes crie a mesma empresa de novo.
 */
async function garantirFornecedor(db: Banco, fornecedor: PlanoFornecedor) {
  const openId = `agiliza-${fornecedor.cnpj}`;
  if (openId === process.env.OWNER_OPEN_ID) {
    throw new Error(`O openId ${openId} é o do dono do sistema; upsertUser promoveria essa conta a admin.`);
  }

  const daEmpresa = await db
    .select({ id: users.id, role: users.role, accessStatus: users.accessStatus })
    .from(users)
    .where(eq(users.companyCnpj, fornecedor.cnpj))
    .orderBy(users.id);

  // Só serve para pendurar o histórico um login que o agrupamento por empresa
  // enxerga: listApprovedCompanyUserIds exige fornecedor aprovado.
  const aproveitavel = daEmpresa.find(usuario => usuario.role === "supplier" && usuario.accessStatus === "approved");
  if (aproveitavel) return { id: aproveitavel.id, criado: false };

  const porOpenId = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
  if (porOpenId[0]) return { id: porOpenId[0].id, criado: false };

  const inserido = await db.insert(users).values({
    openId,
    name: fornecedor.nome,
    // NULL, nunca "": o índice único de e-mail aceita vários NULL e recusaria a
    // segunda string vazia. Sem hash de senha a conta também não consegue entrar.
    email: null,
    companyName: fornecedor.nome,
    companyCnpj: fornecedor.cnpj,
    loginMethod: `importacao-${ORIGEM.toLowerCase()}`,
    passwordHash: null,
    role: "supplier",
    accessStatus: "approved",
    // A conta nasce com a idade do acervo: fingir que entrou hoje colocaria 135
    // fornecedores no topo de qualquer lista ordenada por último acesso.
    createdAt: fornecedor.primeiraCriacao,
    updatedAt: fornecedor.primeiraCriacao,
    lastSignedIn: fornecedor.primeiraCriacao,
  });
  return { id: Number(inserido[0].insertId), criado: true };
}

type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];

async function jaImportada(executor: Banco | Transacao, supplierId: number, invoiceNumber: string) {
  const encontrada = await executor
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.supplierId, supplierId), eq(appointments.invoiceNumber, invoiceNumber)))
    .limit(1);
  return encontrada.length > 0;
}


// ---------------------------------------------------------------------------
// O que entra e o que sai
// ---------------------------------------------------------------------------

/** O conteúdo dos relatórios, já como texto. Só o consolidado é obrigatório. */
export type ArquivosDoAcervo = { consolidado: string; detalhado?: string | null; backlog?: string | null };

export type OpcoesDaImportacao = { confirmar?: boolean; lote?: number };

export type RelatorioDaImportacao = {
  /** false = simulação: leu, validou e contou, sem gravar nada. */
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
  /** Episódios de backlog cuja nota não veio no consolidado. */
  episodiosSemNota: number;
  comentarios: number;
  motivosDesconhecidos: { codigo: string; quantidade: number }[];
  porStatus: Record<string, number>;
  avisos: { linha: number; texto: string }[];
  recusas: { linha: number; motivo: string }[];
  /** Sem banco não dá para saber o que já existe; a contagem vira estimativa. */
  semBanco: boolean;
};

/**
 * Os bytes de um CSV enviado pelo navegador viram texto.
 *
 * O Agiliza exporta em UTF-8, mas um arquivo que passou pelo Excel brasileiro
 * volta em Windows-1252, e aí "Divergência" chega como "Diverg�ncia". Ler como
 * UTF-8 e cair para latin1 quando aparece o caractere de substituição acerta os
 * dois casos sem pedir nada a quem envia.
 */
export function decodificarCsv(base64: string): string {
  const bytes = Buffer.from(base64, "base64");
  const utf8 = bytes.toString("utf8");
  return utf8.includes("\uFFFD") ? bytes.toString("latin1") : utf8;
}

/** O BOM do Excel vem na frente do primeiro cabeçalho e estraga a comparação. */
function semMarcaDeOrdem(texto: string) {
  return texto.replace(/^\ufeff/, "");
}

function buscarPorNota<T>(mapa: Map<string, T>, porNumero: Map<string, T[]>, cnpj: string, numero: string, numeroEhUnico: boolean): T | null {
  const exata = mapa.get(chaveDaNota(cnpj, numero));
  if (exata) return exata;
  // Sem o par exato, o número sozinho só vale quando é único dos dois lados:
  // dois fornecedores diferentes emitem notas com o mesmo número, e aí os itens
  // de uma entrariam na outra.
  if (!numeroEhUnico) return null;
  const candidatas = porNumero.get(numero) ?? [];
  return candidatas.length === 1 ? candidatas[0] : null;
}

function indexarPorNumero<T>(mapa: Map<string, T>): Map<string, T[]> {
  const porNumero = new Map<string, T[]>();
  for (const [chave, valor] of Array.from(mapa.entries())) {
    const numero = chave.split("|")[1] ?? "";
    porNumero.set(numero, [...(porNumero.get(numero) ?? []), valor]);
  }
  return porNumero;
}

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

const formatarData = (data: Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(data);

export async function importarAcervo(arquivos: ArquivosDoAcervo, opcoes: OpcoesDaImportacao = {}): Promise<RelatorioDaImportacao> {
  const confirmar = opcoes.confirmar === true;
  const lote = opcoes.lote ?? LOTE_PADRAO;
  const linhas = lerCsv(semMarcaDeOrdem(arquivos.consolidado));
  if (!linhas.length) throw new Error("O relatório consolidado está vazio.");

  const cabecalho = linhas[0].map(coluna => coluna.trim());
  if (cabecalho.length !== CABECALHO_ESPERADO.length || CABECALHO_ESPERADO.some((esperado, i) => cabecalho[i] !== esperado)) {
    // Falhar aqui e não adiante: com as colunas fora de ordem, o CNPJ do
    // destino entraria como CNPJ do fornecedor e o acervo iria para empresas erradas.
    throw new Error(`Cabeçalho inesperado.\n  esperado: ${CABECALHO_ESPERADO.join(" | ")}\n  recebido: ${cabecalho.join(" | ")}`);
  }

  const recusas: Recusa[] = [];
  const avisos: Aviso[] = [];
  const lidas: LinhaLida[] = [];

  const detalhado = arquivos.detalhado ? lerItens(arquivos.detalhado) : null;
  const acervoDeBacklog = arquivos.backlog ? lerBacklog(arquivos.backlog) : null;
  const itensPorNota = detalhado?.porNota ?? new Map<string, ItensDaNota>();
  const backlogPorNota = acervoDeBacklog?.porNota ?? new Map<string, EpisodioDeBacklog>();
  const itensPorNumero = indexarPorNumero(itensPorNota);
  const backlogPorNumero = indexarPorNumero(backlogPorNota);
  for (const recusa of [...(detalhado?.recusas ?? []), ...(acervoDeBacklog?.recusas ?? [])]) recusas.push(recusa);

  linhas.slice(1).forEach((colunas, indice) => {
    const numeroDaLinha = indice + 2; // +1 do cabeçalho, +1 porque planilha conta do 1
    if (colunas.length !== CABECALHO_ESPERADO.length) {
      recusas.push({ linha: numeroDaLinha, motivo: `linha com ${colunas.length} colunas, esperadas ${CABECALHO_ESPERADO.length}` });
      return;
    }
    const resultado = EsquemaLinha.safeParse({
      dataCriacao: colunas[0],
      ultimoStatus: colunas[1],
      dataUltimoStatus: colunas[2],
      dataAgendamento: colunas[3],
      numeroNota: colunas[4],
      numeroPedido: colunas[5],
      cnpjFornecedor: colunas[6],
      nomeFornecedor: colunas[7],
      totalLinhas: colunas[8],
      cnpjDestino: colunas[9],
      descricaoDestino: colunas[10],
    });
    if (!resultado.success) {
      const motivo = resultado.error.issues.map(problema => `${problema.path.join(".") || "linha"}: ${problema.message}`).join("; ");
      recusas.push({ linha: numeroDaLinha, motivo });
      return;
    }
    lidas.push({ numero: numeroDaLinha, dados: resultado.data });
  });

  // Os CNPJs íntegros do próprio arquivo são a única referência confiável para
  // reconstruir os que vieram mutilados.
  const cnpjsConhecidos = new Set(
    lidas.map(linha => linha.dados.cnpjFornecedor).filter(cnpj => cnpj.length === 14 && cnpjValido(cnpj))
  );

  // Quantas vezes cada número de nota aparece no consolidado: é o que decide se
  // a busca pelo número sozinho é segura quando o CNPJ não casa.
  const repetidosNoConsolidado = new Map<string, number>();
  for (const { dados } of lidas) repetidosNoConsolidado.set(dados.numeroNota, (repetidosNoConsolidado.get(dados.numeroNota) ?? 0) + 1);

  const planos: PlanoNota[] = [];
  const paresVistos = new Set<string>();

  for (const { numero, dados } of lidas) {
    let cnpj = dados.cnpjFornecedor;
    if (cnpj.length !== 14) {
      const reconstruido = reconstruirCnpj(cnpj, cnpjsConhecidos);
      if (!reconstruido) {
        recusas.push({ linha: numero, motivo: `CNPJ do fornecedor incompleto e sem reconstrução possível: ${cnpj} (${dados.nomeFornecedor})` });
        continue;
      }
      avisos.push({ linha: numero, texto: `CNPJ do fornecedor reconstruído: ${cnpj} -> ${reconstruido} (${dados.nomeFornecedor})` });
      cnpj = reconstruido;
    }
    if (!cnpjValido(cnpj)) {
      recusas.push({ linha: numero, motivo: `CNPJ do fornecedor com dígito verificador inválido: ${cnpj} (${dados.nomeFornecedor})` });
      continue;
    }
    if (CNPJS_DA_RVD.has(cnpj)) {
      recusas.push({ linha: numero, motivo: `CNPJ do fornecedor é o da própria RVD (${CNPJS_DA_RVD.get(cnpj)}): colunas trocadas na origem` });
      continue;
    }

    const chave = `${cnpj}|${dados.numeroNota}`;
    if (paresVistos.has(chave)) {
      recusas.push({ linha: numero, motivo: `nota repetida no próprio arquivo para o mesmo fornecedor: ${dados.numeroNota}` });
      continue;
    }
    paresVistos.add(chave);

    // O destino só entra quando é reconhecidamente da RVD. Gravar o CNPJ de um
    // fornecedor ao lado do rótulo "Destinatário" seria informação errada numa
    // tela que a operação usa como documento.
    let destino: string | null = null;
    if (CNPJS_DA_RVD.has(dados.cnpjDestino)) destino = dados.cnpjDestino;
    else if (dados.cnpjDestino) {
      const reconstruido = reconstruirCnpj(dados.cnpjDestino, new Set(CNPJS_DA_RVD.keys()));
      if (reconstruido) {
        destino = reconstruido;
        avisos.push({ linha: numero, texto: `CNPJ de destino reconstruído: ${dados.cnpjDestino} -> ${reconstruido}` });
      } else {
        avisos.push({ linha: numero, texto: `CNPJ de destino não reconhecido, gravado como vazio: ${dados.cnpjDestino} (${dados.descricaoDestino})` });
      }
    }

    const status = STATUS_AGILIZA[dados.ultimoStatus];
    const numeroEhUnico = (repetidosNoConsolidado.get(dados.numeroNota) ?? 0) === 1;
    const itens = buscarPorNota(itensPorNota, itensPorNumero, cnpj, dados.numeroNota, numeroEhUnico);
    const episodio = buscarPorNota(backlogPorNota, backlogPorNumero, cnpj, dados.numeroNota, numeroEhUnico);
    const eventos = montarEventos(dados, status, episodio);
    if (itens && dados.totalLinhas !== null && itens.linhas !== dados.totalLinhas) {
      avisos.push({ linha: numero, texto: `o consolidado diz ${dados.totalLinhas} linha(s) e o detalhado trouxe ${itens.linhas} para a nota ${dados.numeroNota}` });
    }
    if (dados.dataAgendamento < dados.dataCriacao) {
      const atraso = Math.round((dados.dataCriacao.getTime() - dados.dataAgendamento.getTime()) / 1000);
      if (atraso > 60) {
        avisos.push({
          linha: numero,
          texto: `agendamento ${formatarData(dados.dataAgendamento)} anterior à criação ${formatarData(dados.dataCriacao)}; a linha do tempo foi ordenada, as datas da nota ficaram como vieram`,
        });
      }
    }

    planos.push({
      linha: numero,
      cnpj,
      dados,
      status,
      // completed no portal só se alcança passando por received, então toda nota
      // concluída de verdade tem recebimento. Sem receivedAt a nota some do
      // "Data recebida" do relatório e de todos os números de recebimento do painel.
      // Agendada ainda não chegou, e backlog não fechou: nenhuma das duas tem
      // recebimento, e inventar um as colocaria nos números de recebido.
      recebidoEm: status === "backlog" || status === "scheduled" ? null : dados.dataUltimoStatus,
      destino,
      eventos,
      itens,
      episodio,
    });
  }

  // Um fornecedor por CNPJ. O nome é o da linha mais recente do acervo: 47
  // CNPJs aparecem com grafias diferentes, e a mais recente é a que a empresa
  // usava por último. O nome de cada linha vai para invoiceSupplierName de
  // qualquer forma, que é o que as telas mostram primeiro.
  const fornecedores = new Map<string, PlanoFornecedor & { referencia: Date; linha: number }>();
  for (const plano of planos) {
    const atual = fornecedores.get(plano.cnpj);
    const referencia = plano.dados.dataCriacao;
    if (!atual) {
      fornecedores.set(plano.cnpj, {
        cnpj: plano.cnpj,
        nome: plano.dados.nomeFornecedor,
        primeiraCriacao: plano.dados.dataCriacao,
        notas: 1,
        referencia,
        linha: plano.linha,
      });
      continue;
    }
    atual.notas += 1;
    if (plano.dados.dataCriacao < atual.primeiraCriacao) atual.primeiraCriacao = plano.dados.dataCriacao;
    // Empate de data resolvido pela linha mais abaixo no arquivo, para que duas
    // execuções escolham sempre o mesmo nome.
    if (referencia > atual.referencia || (referencia.getTime() === atual.referencia.getTime() && plano.linha > atual.linha)) {
      atual.nome = plano.dados.nomeFornecedor;
      atual.referencia = referencia;
      atual.linha = plano.linha;
    }
  }

  const db = await abrirBanco();
  if (confirmar && !db) throw new Error("DATABASE_URL não está definida: sem banco não há o que confirmar.");

  const contagem = { importadas: 0, jaExistentes: 0, criados: 0, reaproveitados: 0, comentarios: 0 };

  if (db) {
    const idPorCnpj = new Map<string, number>();
    for (const fornecedor of Array.from(fornecedores.values())) {
      if (confirmar) {
        // Fora da transação das notas de propósito: criar o fornecedor é
        // idempotente por si (openId único), e prender 135 inserções numa
        // transação só aumentaria a janela em que um erro desfaz tudo.
        const { id, criado } = await garantirFornecedor(db, fornecedor);
        idPorCnpj.set(fornecedor.cnpj, id);
        if (criado) contagem.criados += 1;
        else contagem.reaproveitados += 1;
        continue;
      }
      const existente = await db
        .select({ id: users.id, role: users.role, accessStatus: users.accessStatus })
        .from(users)
        .where(eq(users.companyCnpj, fornecedor.cnpj))
        .orderBy(users.id);
      const aproveitavel = existente.find(usuario => usuario.role === "supplier" && usuario.accessStatus === "approved");
      if (aproveitavel) {
        idPorCnpj.set(fornecedor.cnpj, aproveitavel.id);
        contagem.reaproveitados += 1;
      } else contagem.criados += 1;
    }

    for (const lotePlanos of emLotes(planos, lote)) {
      if (!confirmar) {
        for (const plano of lotePlanos) {
          const supplierId = idPorCnpj.get(plano.cnpj);
          // Sem o fornecedor no banco não existe nota dele para já estar lá.
          if (supplierId && (await jaImportada(db, supplierId, plano.dados.numeroNota))) contagem.jaExistentes += 1;
          else contagem.importadas += 1;
        }
        continue;
      }

      // A nota e o histórico dela entram juntos ou não entram: um agendamento
      // sem histórico é um registro que o portal não sabe explicar. O lote é
      // pequeno para que uma falha no meio do arquivo deixe o trabalho já feito
      // gravado — o que faltar entra na próxima execução, sem duplicar.
      const parcial = { importadas: 0, jaExistentes: 0, comentarios: 0 };
      await db.transaction(async tx => {
        for (const plano of lotePlanos) {
          const supplierId = idPorCnpj.get(plano.cnpj);
          if (!supplierId) throw new Error(`Fornecedor ${plano.cnpj} não foi criado; linha ${plano.linha}.`);
          if (await jaImportada(tx, supplierId, plano.dados.numeroNota)) {
            parcial.jaExistentes += 1;
            continue;
          }
          const ultimoEvento = plano.eventos[plano.eventos.length - 1];
          const episodio = plano.episodio;
          const inserida = await tx.insert(appointments).values({
            supplierId,
            // Mesmo formato curto que o portal usa em createUnscheduledReceipt:
            // este texto vira a coluna "Item recebido" do relatório.
            serviceType: `Recebimento NF ${plano.dados.numeroNota}`.slice(0, 80),
            scheduledFor: plano.dados.dataAgendamento,
            notes: montarObservacao(plano),
            source: "importado",
            invoiceNumber: plano.dados.numeroNota,
            purchaseOrder: plano.dados.numeroPedido,
            invoiceSupplierName: plano.dados.nomeFornecedor,
            recipientCnpj: plano.destino,
            receivedAt: plano.recebidoEm,
            // Valor e itens vêm do relatório detalhado; sem ele a nota entra
            // sem resumo financeiro, como entrava antes.
            invoiceTotalCents: plano.itens?.totalCents ?? null,
            invoiceItemsJson: plano.itens ? JSON.stringify(plano.itens.itens) : null,
            // O motivo fica gravado mesmo em nota já resolvida: é dele que o
            // relatório de backlog monta a coluna "Motivo" de cada episódio.
            backlogReasonCode: episodio?.codigo ?? null,
            backlogReason: episodio ? montarDescricaoDoMotivo(episodio) : null,
            status: plano.status,
            handledBy: null,
            // createdAt/updatedAt têm default "agora": sem passar as datas do
            // acervo, as 3.725 notas apareceriam criadas no dia da importação.
            createdAt: plano.dados.dataCriacao,
            updatedAt: ultimoEvento.quando,
          });
          const appointmentId = Number(inserida[0].insertId);
          await tx.insert(appointmentStatusHistory).values(
            plano.eventos.map(evento => ({
              appointmentId,
              previousStatus: evento.anterior,
              nextStatus: evento.proximo,
              handledBy: null,
              eventNote: `Importação do histórico do ${ORIGEM}: ${evento.nota}`,
              previousScheduledFor: null,
              nextScheduledFor: evento.agendadoPara,
              createdAt: evento.quando,
            }))
          );
          // Os comentários do acervo entram como observações internas, e não
          // como mensagens do fornecedor: são conversa de dentro da operação e
          // a outra tabela é visível para quem enviou a nota.
          if (episodio?.comentarios.length) {
            await tx.insert(appointmentInternalNotes).values(
              episodio.comentarios.map(comentario => ({
                appointmentId,
                authorId: null,
                body: `[${ORIGEM}] ${comentario.autor}: ${comentario.texto}`,
                createdAt: comentario.quando ?? plano.dados.dataUltimoStatus,
              }))
            );
            parcial.comentarios += episodio.comentarios.length;
          }
          parcial.importadas += 1;
        }
      });
      contagem.importadas += parcial.importadas;
      contagem.jaExistentes += parcial.jaExistentes;
      contagem.comentarios += parcial.comentarios;
    }
  } else {
    contagem.importadas = planos.length;
    contagem.criados = fornecedores.size;
  }

  const porStatus: Record<string, number> = {};
  for (const plano of planos) porStatus[plano.status] = (porStatus[plano.status] ?? 0) + 1;

  return {
    gravou: confirmar,
    linhasConsolidado: linhas.length - 1,
    linhasDetalhado: detalhado?.linhas ?? null,
    linhasBacklog: acervoDeBacklog?.linhas ?? null,
    importadas: contagem.importadas,
    jaExistentes: contagem.jaExistentes,
    fornecedores: { total: fornecedores.size, criados: contagem.criados, reaproveitados: contagem.reaproveitados },
    notasComItens: planos.filter(plano => plano.itens !== null).length,
    notasComBacklog: planos.filter(plano => plano.episodio !== null).length,
    backlogEmAberto: planos.filter(plano => plano.status === "backlog").length,
    episodiosSemNota: Math.max(0, backlogPorNota.size - planos.filter(plano => plano.episodio !== null).length),
    comentarios: confirmar ? contagem.comentarios : planos.reduce((total, plano) => total + (plano.episodio?.comentarios.length ?? 0), 0),
    motivosDesconhecidos: Array.from(acervoDeBacklog?.motivosDesconhecidos.entries() ?? []).map(([codigo, quantidade]) => ({ codigo, quantidade })),
    porStatus,
    avisos: avisos.map(aviso => ({ linha: aviso.linha, texto: aviso.texto })),
    recusas: [...recusas].sort((a, b) => a.linha - b.linha),
    semBanco: db === null,
  };
}
