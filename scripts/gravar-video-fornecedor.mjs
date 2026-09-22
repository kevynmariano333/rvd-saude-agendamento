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
 *   4. `playwright` instalado e um Chromium em disco;
 *   5. `piper` e `ffmpeg` no PATH, e VOZ_PIPER apontando para o .onnx da voz
 *      em português (sem isso ele grava sem narração).
 *
 *   node scripts/gravar-video-fornecedor.mjs /caminho/da/saida
 *
 * Sai o MP4 já narrado. A fala vem de docs/narracao-fornecedor.json, e é ela
 * que dita o ritmo: cada legenda fica na tela pelo menos o tempo da sua frase,
 * então a imagem nunca corre na frente do áudio.
 *
 * Dois trechos acontecem fora da tela do fornecedor — a aprovação do cadastro e
 * a confirmação da data pelo Operador — e são feitos direto no banco da cópia
 * local, para a gravação não sair do ponto de vista de quem agenda.
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";
import { medirLegendas } from "./tempos-das-legendas.mjs";

const SAIDA = process.argv[2];
const BASE = "http://127.0.0.1:3000";
const XML = new URL("../docs/demonstracao/NF-1503-tecnolab.xml", import.meta.url).pathname;
const EMAIL = "comercial@tecnolab.com.br";
const SENHA = "tecnolab2026";
mkdirSync(SAIDA, { recursive: true });

const espera = ms => new Promise(r => setTimeout(r, ms));

const VOZ = process.env.VOZ_PIPER || "";
const FALAS = JSON.parse(readFileSync(new URL("../docs/narracao-fornecedor.json", import.meta.url), "utf8"));
const PASTA_AUDIO = `${SAIDA}/audio`;

/**
 * Gera o que falta da narração e devolve quanto dura cada frase.
 *
 * Sem voz configurada, devolve zero para todas: aí o roteiro cai no tempo
 * mínimo de cada legenda e o vídeo sai mudo, como antes.
 */
function prepararNarracao() {
  // Sem voz, cada legenda fica um tempo fixo e o vídeo sai mudo.
  if (!VOZ) return Object.fromEntries(FALAS.map(fala => [fala.id, 2.6]));
  mkdirSync(PASTA_AUDIO, { recursive: true });
  const duracoes = {};
  for (const fala of FALAS) {
    const arquivo = `${PASTA_AUDIO}/${fala.id}.wav`;
    if (!existsSync(arquivo)) execFileSync("piper", ["-m", VOZ, "-f", arquivo, "--length-scale", "1.05"], { input: fala.texto });
    const medida = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arquivo], { encoding: "utf8" });
    duracoes[fala.id] = Number(medida.trim());
  }
  return duracoes;
}

/** Junta vídeo, narração e a hora em que cada frase entra. */
function montarMp4(webm, linhaDoTempo) {
  const destino = `${SAIDA}/como-agendar-fornecedor-rvd.mp4`;
  const video = ["-i", webm];
  if (!VOZ) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...video, "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", "25", destino]);
    return destino;
  }
  // Os tempos da gravação não servem para colocar a fala: o vídeo sai esticado.
  // Vale onde cada legenda aparece dentro do arquivo.
  const tempos = medirLegendas(webm, linhaDoTempo);
  const entradas = tempos.flatMap(marca => ["-i", `${PASTA_AUDIO}/${marca.id}.wav`]);
  const atrasos = tempos.map((marca, indice) => `[${indice + 1}:a]adelay=${Math.round(marca.video * 1000)}[f${indice}]`).join(";");
  const mistura = `${tempos.map((_, indice) => `[f${indice}]`).join("")}amix=inputs=${tempos.length}:normalize=0:dropout_transition=0,apad[narracao]`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...video, ...entradas,
    "-filter_complex", `${atrasos};${mistura}`, "-map", "0:v", "-map", "[narracao]", "-shortest",
    "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart", "-r", "25", destino]);
  return destino;
}

const duracoes = prepararNarracao();
const linhaDoTempo = [];

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
// A gravação começa junto com a página: as marcas da linha do tempo são
// contadas a partir daqui, e é por elas que a narração entra no lugar certo.
const t0 = Date.now();

// A imagem segue a narração, e não o contrário: cada legenda só troca depois
// que a frase anterior terminou de ser falada.
let fimDaFala = 0;
async function legenda(id, passo, texto) {
  const restante = fimDaFala - Date.now();
  if (restante > 0) await espera(restante);
  await pagina.evaluate(([p, t]) => window.__rvd.legenda(p, t), [passo, texto]);
  linhaDoTempo.push({ id, inicio: Date.now() - t0 });
  fimDaFala = Date.now() + duracoes[id] * 1000 + 400;
  // Um respiro para quem assiste ler a legenda antes de a tela se mexer.
  await espera(Math.min(1300, duracoes[id] * 1000));
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
await legenda("abertura", "Portal RVD Saúde", "Como criar o seu acesso e agendar a entrega da nota fiscal");

await legenda("passo1", "Passo 1", "Abra o portal e escolha o acesso Fornecedor");
await clicar("button:has-text('Entrar como fornecedor')");
await pagina.waitForLoadState("networkidle");

await legenda("passo2", "Passo 2", "Primeira vez? Clique em “Novo cadastro de fornecedor”");
await clicar("button:has-text('Novo cadastro de fornecedor')");

await legenda("passo3", "Passo 3", "Informe a razão social e o CNPJ da sua empresa");
await escrever("#companyName", "Tecnolab Produtos Hospitalares Ltda");
await escrever("#companyCnpj", "12.345.678/0001-90");

await legenda("passo4", "Passo 4", "Cadastre o e-mail e crie uma senha de no mínimo 6 caracteres");
await escrever("#email", EMAIL);
await escrever("#password", SENHA);
await escrever("#passwordConfirmation", SENHA);

await legenda("passo5", "Passo 5", "Clique em “Criar conta de fornecedor”");
await clicar("button:has-text('Criar conta de fornecedor')");
await espera(2000);

await legenda("analise", "Análise", "O cadastro fica em análise — o Operador libera o seu acesso");
// O Operador aprova em "Acessos". Na gravação isso é feito direto no banco da
// cópia local, para o vídeo seguir sem sair da tela do fornecedor.
await noBanco("UPDATE users SET accessStatus = 'approved' WHERE email = ?", [EMAIL]);

await legenda("passo6", "Passo 6", "Com o acesso liberado, entre com o seu e-mail e a sua senha");
await escrever("#email", EMAIL);
await escrever("#password", SENHA);
await clicar("button:has-text('Entrar no portal')");
await pagina.waitForURL(`${BASE}/fornecedor`, { timeout: 20000 });
await pagina.waitForLoadState("networkidle");
await espera(1400);

await legenda("atencao", "Atenção", "A entrega é no operador logístico — confira o endereço no lembrete");
await pagina.evaluate(() => window.__rvd.destacar("section.bg-brand div.mt-5.rounded-2xl"));
await espera(2600);
await pagina.evaluate(() => window.__rvd.apagar());

await legenda("passo7", "Passo 7", "Selecione o arquivo XML da nota fiscal");
await apontar("#invoice-xml");
await pagina.setInputFiles("#invoice-xml", XML);
await espera(1800);

await legenda("passo8", "Passo 8", "Informe o número do pedido de compra — é obrigatório");
await escrever("#purchase-order", "4504748409");

await legenda("passo9", "Passo 9", "Se quiser, sugira uma data e um horário para o Operador avaliar");
await preencher("input[type='date']", "2026-09-25");
await preencher("input[type='time']", "13:00");
await escrever("textarea", "Carga paletizada, preferimos o periodo da manha.");

await legenda("passo10", "Passo 10", "Clique em “Enviar agendamento”");
await clicar("button:has-text('Enviar agendamento')");
await espera(2800);

const avisos = await pagina.locator("[data-sonner-toast]").allTextContents();
if (!avisos.some(aviso => aviso.includes("análise"))) throw new Error(`O envio não foi aceito: ${JSON.stringify(avisos)}`);

await legenda("pronto", "Pronto!", "A nota entra como “Em análise” até o Operador confirmar a data");
await pagina.mouse.wheel(0, 450);
await espera(2400);

// O Operador confirma a data do lado dele; no vídeo, direto no banco local.
await noBanco("UPDATE appointments SET status = 'scheduled', scheduledFor = ? WHERE id = (SELECT id FROM (SELECT MAX(id) AS id FROM appointments) AS ultima)", [new Date("2026-09-25T16:00:00.000Z")]);

await legenda("passo11", "Passo 11", "Quando o Operador confirma, o status muda para “Agendado”");
await pagina.reload();
await pagina.waitForLoadState("networkidle");
await pagina.mouse.wheel(0, 450);
await espera(2600);

await legenda("passo12", "Passo 12", "Baixe o comprovante e entregue junto com a nota ao motorista");
const baixando = pagina.waitForEvent("download", { timeout: 20000 });
await clicar("button:has-text('Comprovante PDF')");
const arquivo = await baixando;
await arquivo.saveAs(`${SAIDA}/comprovante.pdf`);
await espera(3000);

await legenda("duvidas", "Dúvidas?", "Use o botão “Conversar” do agendamento para falar com o Operador");
// Fecha só depois da última frase, senão o vídeo acaba no meio dela.
const sobra = fimDaFala - Date.now();
if (sobra > 0) await espera(sobra);
await pagina.evaluate(() => window.__rvd.esconder());
await espera(900);
const video = pagina.video();
await pagina.close();
await contexto.close();
await navegador.close();

writeFileSync(`${SAIDA}/linha-do-tempo.json`, JSON.stringify(linhaDoTempo, null, 1));
console.log("gravado:", montarMp4(await video.path(), linhaDoTempo));
