/**
 * Grava o passo a passo do fornecedor — do cadastro ao comprovante — com o
 * sistema rodando de verdade, e não com telas montadas à mão: o que aparece no
 * vídeo é o portal respondendo.
 *
 * Precisa de uma cópia local completa, porque o roteiro cria conta, envia XML e
 * baixa o PDF:
 *
 *   1. um MySQL/MariaDB com o schema aplicado (`pnpm db:push`);
 *   2. um bucket S3 (ou um substituto local que só guarde e devolva arquivos);
 *   3. o app no ar (`pnpm dev`), com DATABASE_URL, JWT_SECRET e as variáveis S3_*;
 *   4. `playwright` instalado e um Chromium em disco.
 *
 *   node scripts/gravar-video-fornecedor.mjs /caminho/da/saida
 *
 * Sai um .webm; para MP4:
 *   ffmpeg -i saida/*.webm -c:v libx264 -crf 23 -pix_fmt yuv420p video.mp4
 *
 * Dois trechos acontecem fora da tela do fornecedor — a aprovação do cadastro e
 * a confirmação da data pelo Operador — e são feitos direto no banco da cópia
 * local, para a gravação não sair do ponto de vista de quem agenda.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import mysql from "mysql2/promise";

const SAIDA = process.argv[2];
const BASE = "http://127.0.0.1:3000";
const XML = new URL("../docs/demonstracao/NF-1503-tecnolab.xml", import.meta.url).pathname;
const EMAIL = "comercial@tecnolab.com.br";
const SENHA = "tecnolab2026";
mkdirSync(SAIDA, { recursive: true });

const espera = ms => new Promise(r => setTimeout(r, ms));

// Legenda e cursor desenhados por cima da página: o vídeo não tem áudio, então
// cada passo precisa estar escrito, e o ponteiro do mouse não é gravado.
const enfeites = `
window.__rvd = {
  montar() {
    if (document.getElementById("rvd-legenda")) return;
    const barra = document.createElement("div");
    barra.id = "rvd-legenda";
    barra.innerHTML = '<span id="rvd-passo"></span><span id="rvd-texto"></span>';
    document.body.appendChild(barra);
    const cursor = document.createElement("div");
    cursor.id = "rvd-cursor";
    document.body.appendChild(cursor);
    const estilo = document.createElement("style");
    estilo.textContent = \`
      #rvd-legenda { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483646;
        display: flex; align-items: center; gap: 16px; padding: 18px 28px;
        background: linear-gradient(90deg, #5d1a5d 0%, #782078 100%); color: #fff;
        font-family: Inter, system-ui, sans-serif; opacity: 0; transition: opacity .35s; }
      #rvd-legenda.visivel { opacity: 1; }
      #rvd-passo { flex: none; background: #8EC1D9; color: #4a1449; font-weight: 800;
        font-size: 13px; letter-spacing: .1em; text-transform: uppercase; padding: 7px 14px; border-radius: 999px; }
      #rvd-texto { font-size: 21px; font-weight: 700; line-height: 1.3; }
      #rvd-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px;
        border-radius: 999px; background: rgba(120,32,120,.35); border: 2px solid #782078;
        box-shadow: 0 0 0 6px rgba(142,193,217,.35); transition: left .5s ease, top .5s ease, transform .15s;
        left: -100px; top: -100px; pointer-events: none; }
      #rvd-cursor.clicando { transform: scale(.6); }
      .rvd-alvo { outline: 3px solid #8EC1D9 !important; outline-offset: 3px; border-radius: 12px; }
    \`;
    document.head.appendChild(estilo);
  },
  legenda(passo, texto) {
    this.montar();
    document.getElementById("rvd-passo").textContent = passo;
    document.getElementById("rvd-texto").textContent = texto;
    document.getElementById("rvd-legenda").classList.add("visivel");
  },
  esconder() { document.getElementById("rvd-legenda")?.classList.remove("visivel"); },
  cursor(x, y) { this.montar(); const c = document.getElementById("rvd-cursor"); c.style.left = x + "px"; c.style.top = y + "px"; },
  clique() { const c = document.getElementById("rvd-cursor"); c.classList.add("clicando"); setTimeout(() => c.classList.remove("clicando"), 200); },
  destacar(seletor) { document.querySelector(seletor)?.classList.add("rvd-alvo"); },
  apagar() { document.querySelectorAll(".rvd-alvo").forEach(e => e.classList.remove("rvd-alvo")); },
};
document.addEventListener("DOMContentLoaded", () => window.__rvd.montar());
`;

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--lang=pt-BR"] });
const contexto = await navegador.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: SAIDA, size: { width: 1280, height: 720 } },
  locale: "pt-BR", timezoneId: "America/Sao_Paulo", acceptDownloads: true,
});
await contexto.addInitScript(enfeites);
const pagina = await contexto.newPage();

async function legenda(passo, texto, pausa = 2800) {
  await pagina.evaluate(([p, t]) => window.__rvd.legenda(p, t), [passo, texto]);
  await espera(pausa);
}
async function apontar(seletor) {
  const caixa = await pagina.locator(seletor).first().boundingBox();
  if (!caixa) return;
  await pagina.evaluate(([x, y]) => window.__rvd.cursor(x, y), [caixa.x + caixa.width / 2, caixa.y + caixa.height / 2]);
  await espera(700);
}
async function clicar(seletor) {
  await apontar(seletor);
  await pagina.evaluate(() => window.__rvd.clique());
  await espera(250);
  await pagina.locator(seletor).first().click();
  await espera(900);
}
async function escrever(seletor, texto) {
  await apontar(seletor);
  await pagina.locator(seletor).first().click();
  // O formulário guarda o que já foi digitado quando troca de cadastro para
  // acesso; sem limpar, o texto novo entraria emendado no antigo.
  await pagina.locator(seletor).first().fill("");
  await pagina.locator(seletor).first().pressSequentially(texto, { delay: 55 });
  await espera(600);
}
// Data e hora são campos nativos: digitar dígito a dígito depende do formato
// do navegador e pode deixar o campo pela metade — aqui o valor é preenchido de
// uma vez, no formato que o campo espera.
async function preencher(seletor, valor) {
  await apontar(seletor);
  await pagina.locator(seletor).first().fill(valor);
  await espera(700);
}
async function noBanco(sql, valores) {
  const conexao = await mysql.createConnection(process.env.DATABASE_URL);
  await conexao.execute(sql, valores);
  await conexao.end();
}

await pagina.goto(`${BASE}/`);
await pagina.waitForLoadState("networkidle");
await legenda("Portal RVD Saúde", "Como criar o seu acesso e agendar a entrega da nota fiscal", 4000);

await legenda("Passo 1", "Abra o portal e escolha o acesso Fornecedor");
await clicar("button:has-text('Entrar como fornecedor')");
await pagina.waitForLoadState("networkidle");

await legenda("Passo 2", "Primeira vez? Clique em “Novo cadastro de fornecedor”");
await clicar("button:has-text('Novo cadastro de fornecedor')");

await legenda("Passo 3", "Informe a razão social e o CNPJ da sua empresa");
await escrever("#companyName", "Tecnolab Produtos Hospitalares Ltda");
await escrever("#companyCnpj", "12.345.678/0001-90");

await legenda("Passo 4", "Cadastre o e-mail e crie uma senha de no mínimo 6 caracteres");
await escrever("#email", EMAIL);
await escrever("#password", SENHA);
await escrever("#passwordConfirmation", SENHA);

await legenda("Passo 5", "Clique em “Criar conta de fornecedor”");
await clicar("button:has-text('Criar conta de fornecedor')");
await espera(2000);

await legenda("Análise", "O cadastro fica em análise — o Operador libera o seu acesso", 4200);
// O Operador aprova em "Acessos". Na gravação isso é feito direto no banco da
// cópia local, para o vídeo seguir sem sair da tela do fornecedor.
await noBanco("UPDATE users SET accessStatus = 'approved' WHERE email = ?", [EMAIL]);

await legenda("Passo 6", "Com o acesso liberado, entre com o seu e-mail e a sua senha");
await escrever("#email", EMAIL);
await escrever("#password", SENHA);
await clicar("button:has-text('Entrar no portal')");
await pagina.waitForURL(`${BASE}/fornecedor`, { timeout: 20000 });
await pagina.waitForLoadState("networkidle");
await espera(1400);

await legenda("Atenção", "A entrega é no operador logístico — confira o endereço no lembrete", 4200);
await pagina.evaluate(() => window.__rvd.destacar("section.bg-brand div.mt-5.rounded-2xl"));
await espera(2600);
await pagina.evaluate(() => window.__rvd.apagar());

await legenda("Passo 7", "Selecione o arquivo XML da nota fiscal");
await apontar("#invoice-xml");
await pagina.setInputFiles("#invoice-xml", XML);
await espera(1800);

await legenda("Passo 8", "Informe o número do pedido de compra — é obrigatório");
await escrever("#purchase-order", "4504748409");

await legenda("Passo 9", "Se quiser, sugira uma data e um horário para o Operador avaliar");
await preencher("input[type='date']", "2026-09-25");
await preencher("input[type='time']", "13:00");
await escrever("textarea", "Carga paletizada, preferimos o periodo da manha.");

await legenda("Passo 10", "Clique em “Enviar agendamento”");
await clicar("button:has-text('Enviar agendamento')");
await espera(2800);

const avisos = await pagina.locator("[data-sonner-toast]").allTextContents();
if (!avisos.some(aviso => aviso.includes("análise"))) throw new Error(`O envio não foi aceito: ${JSON.stringify(avisos)}`);

await legenda("Pronto!", "A nota entra como “Em análise” até o Operador confirmar a data", 4000);
await pagina.mouse.wheel(0, 450);
await espera(2400);

// O Operador confirma a data do lado dele; no vídeo, direto no banco local.
await noBanco("UPDATE appointments SET status = 'scheduled', scheduledFor = ? WHERE id = (SELECT id FROM (SELECT MAX(id) AS id FROM appointments) AS ultima)", [new Date("2026-09-25T16:00:00.000Z")]);

await legenda("Passo 11", "Quando o Operador confirma, o status muda para “Agendado”");
await pagina.reload();
await pagina.waitForLoadState("networkidle");
await pagina.mouse.wheel(0, 450);
await espera(2600);

await legenda("Passo 12", "Baixe o comprovante e entregue junto com a nota ao motorista", 3200);
const baixando = pagina.waitForEvent("download", { timeout: 20000 });
await clicar("button:has-text('Comprovante PDF')");
const arquivo = await baixando;
await arquivo.saveAs(`${SAIDA}/comprovante.pdf`);
await espera(3000);

await legenda("Dúvidas?", "Use o botão “Conversar” do agendamento para falar com o Operador", 4200);
await pagina.evaluate(() => window.__rvd.esconder());
await espera(900);
await pagina.close();
await contexto.close();
await navegador.close();
console.log("gravado");
