import { describe, expect, it } from "vitest";
import { lerNotaCompleta } from "./notaCompleta";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe35260911222333000144550010002051369100205136" versao="4.00">
    <ide><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie><nNF>2051369</nNF>
      <dhEmi>2026-09-26T08:12:00-03:00</dhEmi><dhSaiEnt>2026-09-26T14:35:00-03:00</dhSaiEnt>
      <tpNF>1</tpNF><tpAmb>1</tpAmb></ide>
    <emit><CNPJ>11222333000144</CNPJ><xNome>CIRURGICA FERNANDES LTDA</xNome>
      <enderEmit><xLgr>Rua Dona Brigida</xLgr><nro>754</nro><xBairro>Vila Mariana</xBairro>
        <xMun>Sao Paulo</xMun><UF>SP</UF><CEP>04111081</CEP><fone>1155461414</fone></enderEmit>
      <IE>114227116110</IE></emit>
    <dest><CNPJ>43293604002120</CNPJ><xNome>RVD SAUDE MATERNIDADE</xNome>
      <enderDest><xLgr>Avenida Ceci</xLgr><nro>2249</nro><xBairro>Planalto Paulista</xBairro>
        <xMun>Sao Paulo</xMun><UF>SP</UF><CEP>04065012</CEP></enderDest><IE>149884411223</IE></dest>
    <det nItem="1"><prod><cProd>GAZE75</cProd><xProd>Compressa de gaze 7,5x7,5cm</xProd>
      <NCM>30059090</NCM><CFOP>5102</CFOP><uCom>PC</uCom><qCom>100.0000</qCom>
      <vUnCom>35.4000</vUnCom><vProd>3540.00</vProd><xPed>4504886836</xPed></prod>
      <imposto><ICMS><ICMS00><CST>00</CST><vBC>3540.00</vBC><pICMS>18.00</pICMS><vICMS>637.20</vICMS></ICMS00></ICMS>
        <IPI><IPITrib><pIPI>5.00</pIPI><vIPI>177.00</vIPI></IPITrib></IPI></imposto></det>
    <total><ICMSTot><vBC>3540.00</vBC><vICMS>637.20</vICMS><vProd>3540.00</vProd>
      <vFrete>120.00</vFrete><vDesc>40.00</vDesc><vNF>3620.00</vNF></ICMSTot></total>
    <transp><modFrete>1</modFrete>
      <transporta><CNPJ>55666777000188</CNPJ><xNome>ROTA SUL LTDA</xNome><xMun>Cajamar</xMun><UF>SP</UF></transporta>
      <veicTransp><placa>FGH7C43</placa><UF>SP</UF></veicTransp>
      <vol><qVol>14</qVol><esp>CAIXA</esp><pesoL>187.400</pesoL><pesoB>201.850</pesoB></vol></transp>
    <infAdic><infCpl>Entrega agendada pelo portal.</infCpl></infAdic>
  </infNFe></NFe>
  <protNFe><infProt><nProt>135260119887766</nProt><dhRecbto>2026-09-26T08:14:22-03:00</dhRecbto></infProt></protNFe>
</nfeProc>`;

describe("o XML lido inteiro", () => {
  const nota = lerNotaCompleta(XML);

  it("identifica a nota pela chave do atributo Id, sem o prefixo NFe", () => {
    expect(nota.chave).toBe("35260911222333000144550010002051369100205136");
    expect(nota.numero).toBe("2051369");
    expect(nota.serie).toBe("1");
  });

  it("traz o endereço do emitente, que o leitor do agendamento nunca precisou ler", () => {
    expect(nota.emitente.endereco.logradouro).toBe("Rua Dona Brigida");
    expect(nota.emitente.endereco.municipio).toBe("Sao Paulo");
    expect(nota.emitente.inscricaoEstadual).toBe("114227116110");
  });

  it("não confunde o endereço do destinatário com o do emitente", () => {
    expect(nota.destinatario.endereco.logradouro).toBe("Avenida Ceci");
    expect(nota.destinatario.endereco.cep).toBe("04065012");
    expect(nota.destinatario.documento).toBe("43293604002120");
  });

  it("lê o imposto de dentro do grupo de ICMS do item, onde quer que ele esteja", () => {
    const item = nota.itens[0];
    expect(item.ncm).toBe("30059090");
    expect(item.cfop).toBe("5102");
    expect(item.cst).toBe("00");
    expect(item.valorTotalCents).toBe(354000);
    expect(item.valorIcmsCents).toBe(63720);
    expect(item.aliquotaIcms).toBe(18);
    expect(item.valorIpiCents).toBe(17700);
  });

  it("separa o total da nota do total dos produtos, que diferem por frete e desconto", () => {
    expect(nota.totais.produtosCents).toBe(354000);
    expect(nota.totais.freteCents).toBe(12000);
    expect(nota.totais.descontoCents).toBe(4000);
    expect(nota.totais.notaCents).toBe(362000);
  });

  it("traduz o código do frete, que sozinho não diz nada a quem lê a folha", () => {
    expect(nota.transporte.modalidade).toBe("1 - Por conta do destinatário");
    expect(nota.transporte.placa).toBe("FGH7C43");
    expect(nota.transporte.quantidade).toBe(14);
    expect(nota.transporte.pesoBruto).toBe(201.85);
  });

  it("guarda o protocolo de autorização, que é o que dá validade à nota", () => {
    expect(nota.protocolo).toBe("135260119887766");
    expect(nota.protocoloEm?.toISOString()).toBe("2026-09-26T11:14:22.000Z");
    expect(nota.ambiente).toBe("producao");
    expect(nota.tipo).toBe("saida");
  });

  it("não quebra com um XML sem nada dentro — devolve campos vazios", () => {
    const vazia = lerNotaCompleta("<nfeProc></nfeProc>");
    expect(vazia.chave).toBeNull();
    expect(vazia.itens).toEqual([]);
    expect(vazia.totais.notaCents).toBeNull();
  });
});
