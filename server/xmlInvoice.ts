export type XmlInvoiceDetails = {
  invoiceNumber: string | null;
  accessKey: string | null;
  issuedAt: Date | null;
  serviceDescription: string | null;
  supplierName: string | null;
  /** CNPJ (ou CPF) de quem emitiu a nota. */
  supplierCnpj: string | null;
  recipientCnpj: string | null;
  purchaseOrder: string | null;
  totalCents: number | null;
  volumeCount: number | null;
  items: Array<{ description: string; quantity: number | null; unitPriceCents: number | null; totalCents: number | null }>;
};

export const MAX_XML_BYTES = 2 * 1024 * 1024;

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function readTag(xml: string, tagNames: string[]) {
  for (const tag of tagNames) {
    const expression = new RegExp(`<(?:(?:\\w+:)?${tag})\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i");
    const match = xml.match(expression);
    if (match?.[1]) return decodeXmlText(match[1]);
  }
  return null;
}

function readScopedTag(xml: string, scopeTag: string, tagNames: string[]) {
  const expression = new RegExp(`<(?:(?:\\w+:)?${scopeTag})\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${scopeTag}>`, "i");
  const scope = xml.match(expression);
  return scope?.[1] ? readTag(scope[1], tagNames) : null;
}

function readScopes(xml: string, scopeTag: string) {
  const expression = new RegExp(`<(?:(?:\\w+:)?${scopeTag})\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${scopeTag}>`, "gi");
  return Array.from(xml.matchAll(expression), match => match[1] ?? "");
}

function parseXmlDate(value: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  const date = new Date(normalized.includes("T") ? normalized : `${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMoneyToCents(value: string | null) {
  if (!value) return null;
  const cleaned = value.trim().replace(/[R$\s]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function parseQuantity(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseVolumeCount(xml: string) {
  const volumeBlocks = readScopes(xml, "vol");
  const volumeValues = volumeBlocks
    .map(scope => parseQuantity(readTag(scope, ["qVol", "qVolumes", "quantidadeVolumes", "QuantidadeVolumes"])))
    .filter((value): value is number => value !== null);
  if (volumeValues.length) return Math.round(volumeValues.reduce((sum, value) => sum + value, 0));

  const directValue = parseQuantity(readTag(xml, ["qVol", "qVolumes", "quantidadeVolumes", "QuantidadeVolumes"]));
  return directValue === null ? null : Math.round(directValue);
}

export function parseInvoiceXml(content: Buffer): XmlInvoiceDetails {
  if (!content.length || content.length > MAX_XML_BYTES) throw new Error("O XML deve ter até 2 MB.");
  const xml = content.toString("utf8").replace(/^\uFEFF/, "");
  if (!xml.trim().startsWith("<") || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("O arquivo enviado não é um XML de nota válido.");

  const invoiceNumber = readTag(xml, ["nNF", "Numero", "NumeroNFe"]);
  const issueDate = parseXmlDate(readTag(xml, ["dhEmi", "dEmi", "DataEmissao", "DataEmissaoNFe"]));
  const serviceDescription = readTag(xml, ["xProd", "xServ", "Discriminacao", "DescricaoServico"]);
  const supplierName = readScopedTag(xml, "emit", ["xNome", "xFant"]);
  // O CNPJ do remetente é o do emitente da nota, e não o do login que a enviou:
  // uma transportadora pode enviar pelo portal a nota de outra empresa.
  const supplierCnpj = readScopedTag(xml, "emit", ["CNPJ", "CPF"]);
  const recipientCnpj = readScopedTag(xml, "dest", ["CNPJ"]);
  const purchaseOrder = readTag(xml, ["xPed", "nPed", "Pedido", "NumeroPedido"]);
  const items = readScopes(xml, "det").map(scope => ({
    description: readTag(scope, ["xProd", "xServ", "Discriminacao", "DescricaoServico"]) || "Item não identificado",
    quantity: parseQuantity(readTag(scope, ["qCom", "qTrib", "qServ", "Quantidade"])),
    unitPriceCents: parseMoneyToCents(readTag(scope, ["vUnCom", "vUnTrib", "vUnServ", "ValorUnitario"])),
    totalCents: parseMoneyToCents(readTag(scope, ["vProd", "vServ", "vItem", "ValorTotalItem"])),
  }));
  const totalCents = parseMoneyToCents(readTag(xml, ["vNF", "vServ", "ValorTotal", "vLiq"])) ?? (items.length && items.every(item => item.totalCents !== null) ? items.reduce((sum, item) => sum + (item.totalCents ?? 0), 0) : null);
  const volumeCount = parseVolumeCount(xml);
  const idMatch = xml.match(/<(?:(?:\w+:)?infNFe)\b[^>]*\bId=["'](?:NFe)?([^"']+)["']/i);
  const accessKey = readTag(xml, ["chNFe", "ChaveAcesso"]) ?? idMatch?.[1] ?? null;
  if (!invoiceNumber && !accessKey) throw new Error("Não foi possível identificar a nota fiscal no XML enviado.");

  return {
    invoiceNumber: invoiceNumber?.slice(0, 100) ?? null,
    accessKey: accessKey ? accessKey.replace(/\s/g, "").slice(0, 80) : null,
    issuedAt: issueDate,
    serviceDescription: serviceDescription?.slice(0, 80) ?? null,
    supplierName: supplierName?.slice(0, 255) ?? null,
    supplierCnpj: supplierCnpj?.replace(/\D/g, "").slice(0, 20) || null,
    recipientCnpj: recipientCnpj?.replace(/\D/g, "").slice(0, 20) ?? null,
    purchaseOrder: purchaseOrder?.slice(0, 100) ?? null,
    totalCents,
    volumeCount,
    items: items.slice(0, 50),
  };
}
