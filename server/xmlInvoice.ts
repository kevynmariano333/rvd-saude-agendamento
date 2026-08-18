export type XmlInvoiceDetails = {
  invoiceNumber: string | null;
  accessKey: string | null;
  issuedAt: Date | null;
  serviceDescription: string | null;
  supplierName: string | null;
  recipientCnpj: string | null;
  purchaseOrder: string | null;
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

function parseXmlDate(value: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  const date = new Date(normalized.includes("T") ? normalized : `${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseInvoiceXml(content: Buffer): XmlInvoiceDetails {
  if (!content.length || content.length > MAX_XML_BYTES) throw new Error("O XML deve ter até 2 MB.");
  const xml = content.toString("utf8").replace(/^\uFEFF/, "");
  if (!xml.trim().startsWith("<") || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("O arquivo enviado não é um XML de nota válido.");

  const invoiceNumber = readTag(xml, ["nNF", "Numero", "NumeroNFe"]);
  const issueDate = parseXmlDate(readTag(xml, ["dhEmi", "dEmi", "DataEmissao", "DataEmissaoNFe"]));
  const serviceDescription = readTag(xml, ["xProd", "xServ", "Discriminacao", "DescricaoServico"]);
  const supplierName = readScopedTag(xml, "emit", ["xNome", "xFant"]);
  const recipientCnpj = readScopedTag(xml, "dest", ["CNPJ"]);
  const purchaseOrder = readTag(xml, ["xPed", "nPed", "Pedido", "NumeroPedido"]);
  const idMatch = xml.match(/<(?:(?:\w+:)?infNFe)\b[^>]*\bId=["'](?:NFe)?([^"']+)["']/i);
  const accessKey = readTag(xml, ["chNFe", "ChaveAcesso"]) ?? idMatch?.[1] ?? null;
  if (!invoiceNumber && !accessKey) throw new Error("Não foi possível identificar a nota fiscal no XML enviado.");

  return {
    invoiceNumber: invoiceNumber?.slice(0, 100) ?? null,
    accessKey: accessKey ? accessKey.replace(/\s/g, "").slice(0, 80) : null,
    issuedAt: issueDate,
    serviceDescription: serviceDescription?.slice(0, 80) ?? null,
    supplierName: supplierName?.slice(0, 255) ?? null,
    recipientCnpj: recipientCnpj?.replace(/\D/g, "").slice(0, 20) ?? null,
    purchaseOrder: purchaseOrder?.slice(0, 100) ?? null,
  };
}
