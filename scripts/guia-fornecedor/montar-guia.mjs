/**
 * Monta o guia do fornecedor em PowerPoint, com as telas capturadas.
 *
 * O mesmo passo a passo do vídeo, para quem precisa mandar por e-mail: o vídeo
 * não passa no anexo, o PDF passa. Para o PDF:
 *
 *   node scripts/guia-fornecedor/montar-guia.mjs <capturas> <saida.pptx>
 *   soffice --headless --convert-to pdf saida.pptx
 *
 * Depende de `pptxgenjs`, que não é dependência do sistema: instale à parte
 * (`npm i pptxgenjs`) na pasta em que for rodar.
 */

import pptxgen from "pptxgenjs";
import { execFileSync } from "node:child_process";

const CAPTURAS = process.argv[2] || "capturas";
const ROXO = "782078", ESCURO = "4A1449", AZUL = "8EC1D9", PALIDO = "F3E8F3";
const TINTA = "2D232D", SUAVE = "6B5A6B";

const PASSOS = [
  { rotulo: "Passo 1", titulo: "Abra o portal e escolha Fornecedor", tela: "t1-inicio.png",
    corpo: "Na tela inicial cada perfil tem a sua porta. A do fornecedor é a primeira: é por ela que você envia notas e acompanha as entregas." },
  { rotulo: "Passo 2", titulo: "Clique em “Novo cadastro de fornecedor”", tela: "c-acesso-cadastro.png",
    corpo: "O cadastro é feito por você, sem precisar pedir para ninguém abrir. Se a sua empresa já tem acesso, use “Já tenho conta”." },
  { rotulo: "Passo 3", titulo: "Informe a razão social e o CNPJ", tela: "t3-cadastro-empresa.png",
    corpo: "Use os dados da empresa que emite a nota fiscal. É por esse CNPJ que o portal reconhece as suas entregas." },
  { rotulo: "Passo 4", titulo: "Cadastre o e-mail e crie uma senha", tela: "t4-cadastro-acesso.png",
    corpo: "O e-mail é o seu login, e é nele que chegam os avisos do agendamento. A senha precisa ter no mínimo seis caracteres." },
  { rotulo: "Passo 5", titulo: "Clique em “Criar conta de fornecedor”", tela: "c-criar-conta.png",
    corpo: "Confira os dados antes de enviar: a conta nasce com o CNPJ que você digitou, e é ele que vai aparecer nas suas notas." },
  { rotulo: "Análise", titulo: "O cadastro fica em análise", tela: "t14-em-aprovacao.png", destaque: true,
    corpo: "A equipe da RVD confere os dados e libera o acesso. Assim que estiver liberado, você entra direto pela tela de acesso." },
  { rotulo: "Passo 6", titulo: "Entre com e-mail e senha", tela: "t5-entrar.png",
    corpo: "Escolha o acesso Fornecedor e use os dados do cadastro. O portal abre direto em “Meus agendamentos”." },
  { rotulo: "Atenção", titulo: "A entrega é no operador logístico", tela: "t6-lembrete.png", destaque: true,
    corpo: "A nota é do hospital, mas a carga descarrega na RVD. O endereço aparece na tela antes do envio e vai impresso no comprovante." },
  { rotulo: "Passo 7", titulo: "Selecione o XML da nota fiscal", tela: "t7-xml.png",
    corpo: "Envie o arquivo XML, não o PDF da DANFE. O portal lê sozinho o número, o valor, os volumes e o destinatário da nota." },
  { rotulo: "Passo 8", titulo: "Informe o pedido de compra", tela: "t8-pedido.png",
    corpo: "Este campo é obrigatório: é por ele que a RVD confere a entrega e lança a nota. Pedidos que começam com 4000 entram sinalizados como urgentes." },
  { rotulo: "Passo 9", titulo: "Sugira uma data e um horário", tela: "t9-sugestao.png",
    corpo: "Opcional. O Operador pode aceitar a sua sugestão com um clique, ou marcar outra data — e você vê a confirmação na mesma tela." },
  { rotulo: "Passo 10", titulo: "Clique em “Enviar agendamento”", tela: "t10-enviar.png",
    corpo: "A nota fica registrada com o XML anexado. Daqui em diante é só acompanhar." },
  { rotulo: "Pronto!", titulo: "A nota fica “Pendente” até a confirmação", tela: "t11-em-analise.png", destaque: true,
    corpo: "No resumo ela aparece em “Em análise”. Enquanto estiver assim, a data ainda não está combinada: não despache o caminhão antes de o Operador confirmar." },
  { rotulo: "Passo 11", titulo: "O status muda para “Agendado”", tela: "t12-agendado.png",
    corpo: "Com a confirmação aparecem a data e a hora combinadas. Esse é o compromisso da entrega." },
  { rotulo: "Passo 12", titulo: "Baixe o comprovante e entregue ao motorista", tela: "c-comprovante.png",
    corpo: "O PDF traz a nota, o pedido, a data, o endereço de entrega e um código que a portaria usa para validar a chegada." },
];

const medir = arquivo => {
  const saida = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", `${CAPTURAS}/${arquivo}`], { encoding: "utf8" }).trim();
  const [largura, altura] = saida.split("x").map(Number);
  return largura / altura;
};

/** A imagem cabe na caixa sem esticar, centrada nela. */
const encaixar = (arquivo, caixa) => {
  const proporcao = medir(arquivo);
  let largura = caixa.w, altura = caixa.w / proporcao;
  if (altura > caixa.h) { altura = caixa.h; largura = caixa.h * proporcao; }
  return { path: `${CAPTURAS}/${arquivo}`, x: caixa.x + (caixa.w - largura) / 2, y: caixa.y + (caixa.h - altura) / 2, w: largura, h: altura };
};

const deck = new pptxgen();
deck.layout = "LAYOUT_16x9";
deck.author = "RVD Saúde";
deck.title = "Como agendar sua entrega — guia do fornecedor";
const sombra = () => ({ type: "outer", color: "3A1039", blur: 12, offset: 3, angle: 90, opacity: 0.2 });

const capa = deck.addSlide();
capa.background = { color: ESCURO };
capa.addShape(deck.ShapeType.ellipse, { x: 7.9, y: -1.6, w: 4.4, h: 4.4, fill: { color: ROXO } });
capa.addText("PORTAL RVD SAÚDE", { x: 0.7, y: 1.0, w: 5, h: 0.3, fontSize: 12, bold: true, charSpacing: 2, color: AZUL, fontFace: "Calibri", isTextBox: true });
capa.addText("Como agendar\nsua entrega", { x: 0.68, y: 1.45, w: 5.2, h: 1.8, fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Calibri", lineSpacingMultiple: 0.95, isTextBox: true });
capa.addText("Guia do fornecedor: do cadastro no portal ao comprovante que o motorista leva. Doze passos, com as telas do sistema.", { x: 0.7, y: 3.35, w: 4.9, h: 0.9, fontSize: 14, color: "E7D8E7", fontFace: "Calibri", lineSpacingMultiple: 1.2, isTextBox: true });
capa.addText("rvdsaude.com.br", { x: 0.7, y: 4.65, w: 4, h: 0.3, fontSize: 11, bold: true, color: AZUL, fontFace: "Calibri", isTextBox: true });
capa.addImage({ ...encaixar("t1-inicio.png", { x: 5.85, y: 1.45, w: 3.65, h: 2.9 }), shadow: sombra() });

PASSOS.forEach((passo, indice) => {
  const slide = deck.addSlide();
  const numero = indice + 2;
  const escuro = Boolean(passo.destaque);
  slide.background = { color: escuro ? ESCURO : "FFFFFF" };

  const textoX = escuro ? 5.6 : 0.55;
  const imagemCaixa = escuro ? { x: 0.55, y: 0.95, w: 4.6, h: 3.7 } : { x: 4.35, y: 0.85, w: 5.1, h: 3.95 };
  slide.addShape(deck.ShapeType.roundRect, { x: textoX, y: 1.2, w: passo.rotulo.length > 7 ? 1.5 : 1.35, h: 0.36, rectRadius: 0.18, fill: { color: escuro ? AZUL : PALIDO } });
  slide.addText(passo.rotulo.toUpperCase(), { x: textoX, y: 1.2, w: passo.rotulo.length > 7 ? 1.5 : 1.35, h: 0.36, fontSize: 11, bold: true, color: escuro ? ESCURO : ROXO, align: "center", fontFace: "Calibri", isTextBox: true, margin: 0 });
  slide.addText(passo.titulo, { x: textoX - 0.03, y: 1.7, w: 3.55, h: 1.25, fontSize: 21, bold: true, color: escuro ? "FFFFFF" : TINTA, fontFace: "Calibri", lineSpacingMultiple: 1, isTextBox: true });
  slide.addText(passo.corpo, { x: textoX, y: 3.05, w: 3.6, h: 1.7, fontSize: 13, color: escuro ? "E7D8E7" : SUAVE, fontFace: "Calibri", lineSpacingMultiple: 1.25, isTextBox: true });
  slide.addImage({ ...encaixar(passo.tela, imagemCaixa), shadow: sombra() });

  const cinza = escuro ? "8E7A8E" : "A796A7";
  slide.addText("RVD Saúde · Guia do fornecedor", { x: 0.55, y: 5.05, w: 4, h: 0.3, fontSize: 9, color: cinza, fontFace: "Calibri", isTextBox: true });
  slide.addText(String(numero), { x: 8.95, y: 5.05, w: 0.5, h: 0.3, fontSize: 9, bold: true, color: cinza, align: "right", fontFace: "Calibri", isTextBox: true });
});

const fim = deck.addSlide();
fim.background = { color: ROXO };
fim.addText("Onde a entrega acontece", { x: 0.7, y: 0.8, w: 5.3, h: 1.0, fontSize: 27, bold: true, color: "FFFFFF", fontFace: "Calibri", isTextBox: true });
fim.addText("Você agenda para o operador logístico da Amil que atende os Hospitais Santa Helena. O endereço também sai impresso no comprovante.", { x: 0.72, y: 1.85, w: 5.1, h: 0.9, fontSize: 13, color: "F0E2F0", fontFace: "Calibri", lineSpacingMultiple: 1.2, isTextBox: true });
[["Operador", "RVD"], ["CNPJ", "39.283.469/0001-10"], ["Endereço de entrega", "Rua Antônio Mestriner, 194 – Jd. Fátima, Guarulhos - SP"], ["CEP", "07175-550"]].forEach(([rotulo, valor], indice) => {
  const y = 2.85 + indice * 0.52;
  fim.addText(rotulo.toUpperCase(), { x: 0.72, y, w: 1.85, h: 0.25, fontSize: 9, bold: true, charSpacing: 1, color: AZUL, fontFace: "Calibri", isTextBox: true, margin: 0 });
  fim.addText(valor, { x: 2.45, y: y - 0.04, w: 3.4, h: 0.4, fontSize: 13, bold: true, color: "FFFFFF", fontFace: "Calibri", isTextBox: true, margin: 0 });
});
fim.addShape(deck.ShapeType.roundRect, { x: 6.4, y: 1.5, w: 3.1, h: 2.5, rectRadius: 0.12, fill: { color: "FFFFFF" }, shadow: sombra() });
fim.addText("Ficou com dúvida?", { x: 6.65, y: 1.78, w: 2.6, h: 0.35, fontSize: 17, bold: true, color: ROXO, fontFace: "Calibri", isTextBox: true });
fim.addText("Use o botão “Conversar” dentro do próprio agendamento: a conversa fica registrada na nota, e o Operador vê de qual entrega você está falando.", { x: 6.65, y: 2.2, w: 2.6, h: 1.6, fontSize: 12, color: SUAVE, fontFace: "Calibri", lineSpacingMultiple: 1.2, isTextBox: true });
fim.addText("Bom agendamento.", { x: 0.72, y: 4.95, w: 4, h: 0.3, fontSize: 12, bold: true, color: AZUL, fontFace: "Calibri", isTextBox: true });

await deck.writeFile({ fileName: process.argv[3] || "como-agendar-fornecedor-rvd.pptx" });
console.log("deck escrito");
