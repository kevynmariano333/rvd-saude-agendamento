/**
 * Tira as telas do guia do fornecedor, do sistema rodando.
 *
 * Quadro de vídeo não serve para material impresso: o texto da tela fica
 * ilegível no slide. Aqui cada captura é do elemento que o passo trata — o
 * lembrete, o formulário, o cartão do histórico —, em dobro de resolução.
 *
 * Precisa da mesma cópia local da gravação do vídeo (banco, armazenamento e app
 * no ar) e de um fornecedor já aprovado. Ver scripts/gravar-video-fornecedor.mjs.
 *
 *   node scripts/guia-fornecedor/capturar-telas.mjs /caminho/das/capturas
 *
 * Duas capturas exigem mexer no estado: o cartão "Pendente" e o "Agendado" são
 * o mesmo agendamento, e o script troca o status no banco entre uma e outra.
 */

import { chromium } from "playwright";
import mysql from "mysql2/promise";
const BASE = "http://127.0.0.1:3000";
const SAIDA = process.argv[2];
const XML = new URL("../../docs/demonstracao/NF-1503-tecnolab.xml", import.meta.url).pathname;

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--lang=pt-BR"] });
const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
const p = await ctx.newPage();
const tirar = async (nome, alvo) => {
  const local = alvo ? p.locator(alvo).first() : p;
  await local.screenshot({ path: `${SAIDA}/${nome}.png` });
  console.log("ok", nome);
};
const banco = async (sql, v) => { const c = await mysql.createConnection(process.env.DATABASE_URL); await c.execute(sql, v); await c.end(); };

// 1. tela inicial e escolha de acesso
await p.goto(`${BASE}/`); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
await tirar("t1-inicio");
await p.locator("button:has-text('Entrar como fornecedor')").click();
await p.waitForLoadState("networkidle"); await p.waitForTimeout(600);
await tirar("t2-acesso");

// 2. formulário de cadastro preenchido (sem enviar)
await p.locator("button:has-text('Novo cadastro de fornecedor')").click();
await p.waitForTimeout(400);
await p.fill("#companyName", "Tecnolab Produtos Hospitalares Ltda");
await p.fill("#companyCnpj", "12.345.678/0001-90");
await tirar("t3-cadastro-empresa", "form");
await p.fill("#email", "comercial@tecnolab.com.br");
await p.fill("#password", "tecnolab2026");
await p.fill("#passwordConfirmation", "tecnolab2026");
await tirar("t4-cadastro-acesso", "form");

// 3. entrada
await p.locator("button:has-text('Já tenho conta')").click();
await p.waitForTimeout(400);
await p.fill("#email", "comercial@tecnolab.com.br");
await p.fill("#password", "tecnolab2026");
await tirar("t5-entrar", "form");
await p.locator("button:has-text('Entrar no portal')").click();
await p.waitForURL(`${BASE}/fornecedor`, { timeout: 20000 });
await p.waitForLoadState("networkidle"); await p.waitForTimeout(1000);

// 4. lembrete e formulário de agendamento
await tirar("t6-lembrete", "section.bg-brand div.mt-5.rounded-2xl");
await p.setInputFiles("#invoice-xml", XML);
await p.waitForTimeout(500);
await tirar("t7-xml", "section.bg-brand form > div:first-child");
await p.fill("#purchase-order", "4504748409");
await tirar("t8-pedido", "section.bg-brand form > div:first-child");
await p.fill("input[type='date']", "2026-09-25");
await p.fill("input[type='time']", "13:00");
await p.fill("textarea", "Carga paletizada, preferimos o periodo da manha.");
await tirar("t9-sugestao", "section.bg-brand form > div:nth-child(2)");
await tirar("t10-enviar", "section.bg-brand form");

// 5. histórico: em análise e agendado
await banco("UPDATE appointments SET status='pending' WHERE id=(SELECT id FROM (SELECT MAX(id) id FROM appointments) u)");
await p.reload(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1200);
await tirar("t11-em-analise", "article");
await banco("UPDATE appointments SET status='scheduled' WHERE id=(SELECT id FROM (SELECT MAX(id) id FROM appointments) u)");
await p.reload(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1200);
await tirar("t12-agendado", "article");
await tirar("t13-acompanhamento", "section.panel");
await nav.close();
