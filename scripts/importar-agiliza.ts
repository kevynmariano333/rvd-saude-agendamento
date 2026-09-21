/**
 * Importação do histórico de recebimento do sistema Agiliza.
 *
 * O Agiliza era o sistema de uma empresa parceira e saiu do ar. O que sobrou do
 * acervo da RVD Saúde é um CSV com as notas já recebidas, sem XML, sem valor
 * fiscal e sem volumes. Este script traz esse acervo para dentro do portal para
 * que cada fornecedor encontre o próprio histórico quando se cadastrar.
 *
 *   pnpm exec tsx scripts/importar-agiliza.ts caminho/agiliza.csv              # simulação
 *   pnpm exec tsx scripts/importar-agiliza.ts caminho/agiliza.csv --confirmar  # grava
 *
 * A simulação é o padrão de propósito: é uma carga grande, feita uma vez, num
 * banco de produção que não tem tela nenhuma para desfazer o estrago. Sem
 * "--confirmar" o script só lê, valida e conta.
 *
 * O script vive fora do app: não é rota, não é serviço, não é importado por
 * ninguém. Ele fala direto com o banco pelo mesmo drizzle que o servidor usa,
 * porque o que precisa ser idêntico é a forma de gravar data e CNPJ, não o
 * caminho até o banco.
 */

import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { z } from "zod";
import {
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
const STATUS_AGILIZA = {
  Concluída: "completed",
  Recebida: "received",
  Backlog: "backlog",
} as const satisfies Record<string, AppointmentStatus>;

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
function lerDataSaoPaulo(valor: string): Date | null {
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

// ---------------------------------------------------------------------------
// Validação da linha
// ---------------------------------------------------------------------------

const DataAgiliza = z
  .string()
  .refine(valor => lerDataSaoPaulo(valor) !== null, "data fora do formato dd/mm/aaaa, hh:mm:ss")
  .transform(valor => lerDataSaoPaulo(valor)!);

const EsquemaLinha = z.object({
  dataCriacao: DataAgiliza,
  ultimoStatus: z.enum(["Concluída", "Recebida", "Backlog"]),
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

type LinhaValidada = z.infer<typeof EsquemaLinha>;

type LinhaLida = { numero: number; dados: LinhaValidada };
type Recusa = { linha: number; motivo: string };
type Aviso = { linha: number; texto: string };

// ---------------------------------------------------------------------------
// Plano de importação
// ---------------------------------------------------------------------------

type Evento = {
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
};

type PlanoFornecedor = {
  cnpj: string;
  nome: string;
  primeiraCriacao: Date;
  notas: number;
};

/**
 * A cadeia de status que o sistema vivo produziria para uma nota dessas:
 * criação, agendamento, recebimento e conclusão, cada passo respeitando o grafo
 * de server/permissions.ts. Um agendamento sem histórico nenhum é um registro
 * que o portal nunca geraria — o diálogo "Histórico de datas" abriria vazio.
 *
 * Os carimbos são forçados a não retroceder: 72 linhas do arquivo têm
 * agendamento anterior à criação (a maioria por 1 ou 2 segundos de relógio da
 * origem, algumas por dias, porque o Agiliza migrou agendamentos antigos em
 * 23/03/2026). As datas de negócio entram como vieram; só a linha do tempo é
 * ajustada, senão a nota apareceria concluída antes de existir.
 */
function montarEventos(dados: LinhaValidada, status: AppointmentStatus): Evento[] {
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

  if (status === "backlog") {
    eventos.push({
      anterior: "pending",
      proximo: "backlog",
      quando: emOrdem(dados.dataUltimoStatus),
      agendadoPara: null,
      nota: `Nota deixada em backlog no sistema ${ORIGEM}.`,
    });
    return eventos;
  }

  eventos.push({
    anterior: "pending",
    proximo: "scheduled",
    quando: emOrdem(dados.dataAgendamento),
    // Só a data nova: com previousScheduledFor preenchido o diálogo rotularia
    // o evento como "Reagendamento", que não foi o que aconteceu.
    agendadoPara: dados.dataAgendamento,
    nota: `Data agendada no sistema ${ORIGEM}.`,
  });
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
  if (plano.destino === null && plano.dados.cnpjDestino) {
    partes.push(`CNPJ de destino da origem não reconhecido e não gravado: ${plano.dados.cnpjDestino}.`);
  }
  return partes.join(" ");
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
function abrirBanco() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return drizzle(url);
}

type Banco = NonNullable<ReturnType<typeof abrirBanco>>;

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
// Execução
// ---------------------------------------------------------------------------

function lerArgumentos(argv: string[]) {
  const caminhos = argv.filter(argumento => !argumento.startsWith("--"));
  const confirmar = argv.includes("--confirmar");
  const loteBruto = argv.find(argumento => argumento.startsWith("--lote="))?.split("=")[1];
  const lote = loteBruto ? Number(loteBruto) : LOTE_PADRAO;
  if (!Number.isInteger(lote) || lote < 1) throw new Error("--lote precisa ser um número inteiro maior que zero.");
  return { csv: caminhos[0], confirmar, lote };
}

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

const formatarData = (data: Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(data);

async function principal() {
  const { csv, confirmar, lote } = lerArgumentos(process.argv.slice(2));
  if (!csv) {
    console.error("Informe o caminho do CSV: pnpm exec tsx scripts/importar-agiliza.ts caminho/agiliza.csv [--confirmar]");
    process.exit(1);
  }

  const texto = readFileSync(csv, "utf8").replace(/^﻿/, "");
  const linhas = lerCsv(texto);
  if (!linhas.length) throw new Error("O arquivo está vazio.");

  const cabecalho = linhas[0].map(coluna => coluna.trim());
  if (cabecalho.length !== CABECALHO_ESPERADO.length || CABECALHO_ESPERADO.some((esperado, i) => cabecalho[i] !== esperado)) {
    // Falhar aqui e não adiante: com as colunas fora de ordem, o CNPJ do
    // destino entraria como CNPJ do fornecedor e o acervo iria para empresas erradas.
    throw new Error(`Cabeçalho inesperado.\n  esperado: ${CABECALHO_ESPERADO.join(" | ")}\n  recebido: ${cabecalho.join(" | ")}`);
  }

  const recusas: Recusa[] = [];
  const avisos: Aviso[] = [];
  const lidas: LinhaLida[] = [];

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
    const eventos = montarEventos(dados, status);
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
      recebidoEm: status === "backlog" ? null : dados.dataUltimoStatus,
      destino,
      eventos,
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

  const db = abrirBanco();
  if (confirmar && !db) throw new Error("DATABASE_URL não está definida: sem banco não há o que confirmar.");

  const contagem = { importadas: 0, jaExistentes: 0, criados: 0, reaproveitados: 0 };

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
      const parcial = { importadas: 0, jaExistentes: 0 };
      await db.transaction(async tx => {
        for (const plano of lotePlanos) {
          const supplierId = idPorCnpj.get(plano.cnpj);
          if (!supplierId) throw new Error(`Fornecedor ${plano.cnpj} não foi criado; linha ${plano.linha}.`);
          if (await jaImportada(tx, supplierId, plano.dados.numeroNota)) {
            parcial.jaExistentes += 1;
            continue;
          }
          const ultimoEvento = plano.eventos[plano.eventos.length - 1];
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
          parcial.importadas += 1;
        }
      });
      contagem.importadas += parcial.importadas;
      contagem.jaExistentes += parcial.jaExistentes;
    }
  } else {
    contagem.importadas = planos.length;
    contagem.criados = fornecedores.size;
  }

  // -------------------------------------------------------------------------
  // Relatório
  // -------------------------------------------------------------------------

  const titulo = confirmar ? "IMPORTAÇÃO CONFIRMADA (dados gravados)" : "SIMULAÇÃO (nada foi gravado)";
  console.log(`\nImportação do histórico do ${ORIGEM} — ${titulo}`);
  console.log(`Arquivo: ${csv}`);
  if (!db) console.log("DATABASE_URL não definida: as contagens de 'já existente' não puderam ser verificadas.");
  console.log("");
  console.log(`Linhas lidas no arquivo: ${linhas.length - 1}`);
  console.log(`${confirmar ? "Importadas:             " : "A importar:             "} ${contagem.importadas}`);
  console.log(`Já existentes:           ${contagem.jaExistentes}`);
  console.log(`Recusadas:               ${recusas.length}`);
  console.log(`Fornecedores:            ${fornecedores.size} (${contagem.criados} criados, ${contagem.reaproveitados} já cadastrados)`);

  if (avisos.length) {
    console.log(`\nAvisos (${avisos.length}):`);
    for (const aviso of avisos) console.log(`  linha ${aviso.linha}: ${aviso.texto}`);
  }

  if (recusas.length) {
    console.log(`\nRecusas (${recusas.length}):`);
    for (const recusa of recusas.sort((a, b) => a.linha - b.linha)) console.log(`  linha ${recusa.linha}: ${recusa.motivo}`);
  }

  if (!confirmar) console.log("\nNada foi gravado. Para gravar, repita o comando com --confirmar.");
  console.log("");
}

principal()
  .then(() => process.exit(0))
  .catch(erro => {
    console.error(`\n[Importação ${ORIGEM}] ${erro instanceof Error ? erro.message : erro}`);
    process.exit(1);
  });
