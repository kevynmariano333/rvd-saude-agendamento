/**
 * O XML da nota lido inteiro, e não só o que o portal precisava.
 *
 * O leitor do servidor (`server/xmlInvoice.ts`) tira do XML o que o
 * agendamento usa: número, chave, fornecedor, itens, total. É o suficiente para
 * marcar uma entrega, e é por isso que ele nunca leu endereço, NCM, CFOP,
 * imposto nem protocolo de autorização — o portal não tinha o que fazer com
 * isso.
 *
 * O DANFE tem: cada quadro daquela folha é um campo do XML, e um quadro vazio
 * numa folha que se diz DANFE é um erro à vista de quem confere. Este leitor é
 * o do documento inteiro.
 *
 * Fica em `shared/` porque o desenho acontece no navegador — o XML já está
 * guardado e é baixado na hora do clique — mas o servidor pode precisar do
 * mesmo dado amanhã, e um segundo leitor divergiria do primeiro em silêncio.
 */

export type EnderecoDaNota = {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
};

export type ParteDaNota = {
  nome: string | null;
  fantasia: string | null;
  documento: string | null;
  inscricaoEstadual: string | null;
  inscricaoSubstituto: string | null;
  endereco: EnderecoDaNota;
};

export type ItemDaNotaCompleta = {
  codigo: string | null;
  descricao: string;
  ncm: string | null;
  cst: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitarioCents: number | null;
  valorTotalCents: number | null;
  baseIcmsCents: number | null;
  valorIcmsCents: number | null;
  valorIpiCents: number | null;
  aliquotaIcms: number | null;
  aliquotaIpi: number | null;
  pedido: string | null;
};

export type NotaCompleta = {
  chave: string | null;
  numero: string | null;
  serie: string | null;
  modelo: string | null;
  naturezaDaOperacao: string | null;
  /** 0 entrada, 1 saída — é o quadradinho marcado no alto do DANFE. */
  tipo: "entrada" | "saida" | null;
  emitidaEm: Date | null;
  saiuEm: Date | null;
  protocolo: string | null;
  protocoloEm: Date | null;
  /** 1 produção, 2 homologação. Homologação exige a tarja de "sem valor fiscal". */
  ambiente: "producao" | "homologacao" | null;
  emitente: ParteDaNota;
  destinatario: ParteDaNota;
  itens: ItemDaNotaCompleta[];
  totais: {
    baseIcmsCents: number | null;
    valorIcmsCents: number | null;
    baseIcmsStCents: number | null;
    valorIcmsStCents: number | null;
    produtosCents: number | null;
    freteCents: number | null;
    seguroCents: number | null;
    descontoCents: number | null;
    outrasCents: number | null;
    ipiCents: number | null;
    notaCents: number | null;
  };
  transporte: {
    modalidade: string | null;
    transportador: string | null;
    documento: string | null;
    inscricaoEstadual: string | null;
    endereco: string | null;
    municipio: string | null;
    uf: string | null;
    placa: string | null;
    placaUf: string | null;
    quantidade: number | null;
    especie: string | null;
    marca: string | null;
    numeracao: string | null;
    pesoLiquido: number | null;
    pesoBruto: number | null;
  };
  informacoesComplementares: string | null;
  informacoesAoFisco: string | null;
};

const MODALIDADES: Record<string, string> = {
  "0": "0 - Por conta do emitente",
  "1": "1 - Por conta do destinatário",
  "2": "2 - Por conta de terceiros",
  "3": "3 - Transporte próprio do remetente",
  "4": "4 - Transporte próprio do destinatário",
  "9": "9 - Sem frete",
};

function decodificar(valor: string): string {
  return valor
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function ler(xml: string, tags: string[]): string | null {
  for (const tag of tags) {
    const expressao = new RegExp(`<(?:(?:\\w+:)?${tag})\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i");
    const achado = xml.match(expressao);
    if (achado?.[1]) return decodificar(achado[1]);
  }
  return null;
}

function escopo(xml: string, tag: string): string | null {
  const expressao = new RegExp(`<(?:(?:\\w+:)?${tag})\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i");
  return xml.match(expressao)?.[1] ?? null;
}

function escopos(xml: string, tag: string): string[] {
  const expressao = new RegExp(`<(?:(?:\\w+:)?${tag})\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "gi");
  return Array.from(xml.matchAll(expressao), achado => achado[1] ?? "");
}

function comoData(valor: string | null): Date | null {
  if (!valor) return null;
  const texto = valor.trim();
  const quando = new Date(texto.includes("T") ? texto : `${texto}T00:00:00`);
  return Number.isNaN(quando.getTime()) ? null : quando;
}

function comoCentavos(valor: string | null): number | null {
  if (!valor) return null;
  const limpo = valor.trim().replace(/[R$\s]/g, "");
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? Math.round(numero * 100) : null;
}

function comoNumero(valor: string | null): number | null {
  if (!valor) return null;
  const numero = Number(valor.trim().replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

function lerEndereco(bloco: string | null): EnderecoDaNota {
  const vazio = { logradouro: null, numero: null, complemento: null, bairro: null, municipio: null, uf: null, cep: null, telefone: null };
  if (!bloco) return vazio;
  const dentro = escopo(bloco, "enderEmit") ?? escopo(bloco, "enderDest") ?? bloco;
  return {
    logradouro: ler(dentro, ["xLgr"]),
    numero: ler(dentro, ["nro"]),
    complemento: ler(dentro, ["xCpl"]),
    bairro: ler(dentro, ["xBairro"]),
    municipio: ler(dentro, ["xMun"]),
    uf: ler(dentro, ["UF"]),
    cep: ler(dentro, ["CEP"]),
    telefone: ler(dentro, ["fone"]),
  };
}

function lerParte(bloco: string | null): ParteDaNota {
  if (!bloco) {
    return { nome: null, fantasia: null, documento: null, inscricaoEstadual: null, inscricaoSubstituto: null, endereco: lerEndereco(null) };
  }
  return {
    nome: ler(bloco, ["xNome"]),
    fantasia: ler(bloco, ["xFant"]),
    documento: (ler(bloco, ["CNPJ", "CPF"]) ?? "").replace(/\D/g, "") || null,
    inscricaoEstadual: ler(bloco, ["IE"]),
    inscricaoSubstituto: ler(bloco, ["IEST"]),
    endereco: lerEndereco(bloco),
  };
}

/** O imposto do item mora dentro de um dos muitos grupos de ICMS. */
function lerIcmsDoItem(item: string) {
  const imposto = escopo(item, "imposto") ?? item;
  const icms = escopo(imposto, "ICMS") ?? imposto;
  return {
    cst: ler(icms, ["CST", "CSOSN"]),
    baseIcmsCents: comoCentavos(ler(icms, ["vBC"])),
    valorIcmsCents: comoCentavos(ler(icms, ["vICMS"])),
    aliquotaIcms: comoNumero(ler(icms, ["pICMS"])),
    valorIpiCents: comoCentavos(ler(escopo(imposto, "IPI") ?? "", ["vIPI"])),
    aliquotaIpi: comoNumero(ler(escopo(imposto, "IPI") ?? "", ["pIPI"])),
  };
}

export function lerNotaCompleta(xmlBruto: string): NotaCompleta {
  const xml = xmlBruto.replace(/^﻿/, "");
  const infNFe = escopo(xml, "infNFe") ?? xml;
  const ide = escopo(infNFe, "ide") ?? "";
  const total = escopo(infNFe, "ICMSTot") ?? escopo(infNFe, "total") ?? "";
  const transp = escopo(infNFe, "transp") ?? "";
  const vol = escopo(transp, "vol") ?? "";
  const prot = escopo(xml, "infProt") ?? "";
  const infAdic = escopo(infNFe, "infAdic") ?? "";

  const idDaChave = xml.match(/<(?:(?:\w+:)?infNFe)\b[^>]*\bId=["'](?:NFe)?([^"']+)["']/i);
  const chave = (ler(xml, ["chNFe"]) ?? idDaChave?.[1] ?? "").replace(/\D/g, "") || null;
  const tipo = ler(ide, ["tpNF"]);
  const ambiente = ler(ide, ["tpAmb"]);

  const itens = escopos(infNFe, "det").map(item => {
    const prod = escopo(item, "prod") ?? item;
    const icms = lerIcmsDoItem(item);
    return {
      codigo: ler(prod, ["cProd"]),
      descricao: ler(prod, ["xProd"]) || "Item não identificado",
      ncm: ler(prod, ["NCM"]),
      cfop: ler(prod, ["CFOP"]),
      unidade: ler(prod, ["uCom"]),
      quantidade: comoNumero(ler(prod, ["qCom"])),
      valorUnitarioCents: comoCentavos(ler(prod, ["vUnCom"])),
      valorTotalCents: comoCentavos(ler(prod, ["vProd"])),
      pedido: ler(prod, ["xPed"]),
      ...icms,
    };
  });

  return {
    chave,
    numero: ler(ide, ["nNF"]),
    serie: ler(ide, ["serie"]),
    modelo: ler(ide, ["mod"]),
    naturezaDaOperacao: ler(ide, ["natOp"]),
    tipo: tipo === "0" ? "entrada" : tipo === "1" ? "saida" : null,
    emitidaEm: comoData(ler(ide, ["dhEmi", "dEmi"])),
    saiuEm: comoData(ler(ide, ["dhSaiEnt", "dSaiEnt"])),
    protocolo: ler(prot, ["nProt"]),
    protocoloEm: comoData(ler(prot, ["dhRecbto"])),
    ambiente: ambiente === "1" ? "producao" : ambiente === "2" ? "homologacao" : null,
    emitente: lerParte(escopo(infNFe, "emit")),
    destinatario: lerParte(escopo(infNFe, "dest")),
    itens,
    totais: {
      baseIcmsCents: comoCentavos(ler(total, ["vBC"])),
      valorIcmsCents: comoCentavos(ler(total, ["vICMS"])),
      baseIcmsStCents: comoCentavos(ler(total, ["vBCST"])),
      valorIcmsStCents: comoCentavos(ler(total, ["vST"])),
      produtosCents: comoCentavos(ler(total, ["vProd"])),
      freteCents: comoCentavos(ler(total, ["vFrete"])),
      seguroCents: comoCentavos(ler(total, ["vSeg"])),
      descontoCents: comoCentavos(ler(total, ["vDesc"])),
      outrasCents: comoCentavos(ler(total, ["vOutro"])),
      ipiCents: comoCentavos(ler(total, ["vIPI"])),
      notaCents: comoCentavos(ler(total, ["vNF"])),
    },
    transporte: {
      modalidade: MODALIDADES[ler(transp, ["modFrete"]) ?? ""] ?? ler(transp, ["modFrete"]),
      transportador: ler(escopo(transp, "transporta") ?? "", ["xNome"]),
      documento: (ler(escopo(transp, "transporta") ?? "", ["CNPJ", "CPF"]) ?? "").replace(/\D/g, "") || null,
      inscricaoEstadual: ler(escopo(transp, "transporta") ?? "", ["IE"]),
      endereco: ler(escopo(transp, "transporta") ?? "", ["xEnder"]),
      municipio: ler(escopo(transp, "transporta") ?? "", ["xMun"]),
      uf: ler(escopo(transp, "transporta") ?? "", ["UF"]),
      placa: ler(escopo(transp, "veicTransp") ?? "", ["placa"]),
      placaUf: ler(escopo(transp, "veicTransp") ?? "", ["UF"]),
      quantidade: comoNumero(ler(vol, ["qVol"])),
      especie: ler(vol, ["esp"]),
      marca: ler(vol, ["marca"]),
      numeracao: ler(vol, ["nVol"]),
      pesoLiquido: comoNumero(ler(vol, ["pesoL"])),
      pesoBruto: comoNumero(ler(vol, ["pesoB"])),
    },
    informacoesComplementares: ler(infAdic, ["infCpl"]),
    informacoesAoFisco: ler(infAdic, ["infAdFisco"]),
  };
}
