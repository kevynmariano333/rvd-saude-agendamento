/**
 * O que mantém o portal de pé.
 *
 * Nada aqui trata de regra de negócio: são as bordas do processo — o erro que
 * ninguém pegou, o desligamento, o tempo das conexões, a pergunta "você está
 * vivo?" que o provedor faz. São as coisas que, quando faltam, derrubam o
 * sistema inteiro por um motivo que não aparece em nenhuma tela.
 */

import type { Express, NextFunction, Request, Response } from "express";
import type { Server } from "http";
import { bancoRespondendo, fecharBanco } from "../db";
import { RVD_SESSION_COOKIE } from "../session";

/**
 * Erros de socket que não significam que o servidor quebrou.
 *
 * O navegador que fecha a aba no meio de um download, a rede que cai, o proxy
 * do provedor que desiste de esperar: tudo isso chega como exceção não tratada
 * num socket. Derrubar o processo por causa disso seria trocar um download
 * perdido pelo sistema fora do ar para todo mundo.
 */
const ERROS_DE_REDE = new Set(["ECONNRESET", "EPIPE", "ECANCELED", "ERR_STREAM_PREMATURE_CLOSE"]);

export function erroDeRede(erro: unknown): boolean {
  const codigo = (erro as { code?: string } | null)?.code;
  return typeof codigo === "string" && ERROS_DE_REDE.has(codigo);
}

/**
 * As duas redes de segurança do processo.
 *
 * Desde o Node 15, uma promessa rejeitada que ninguém trata derruba o processo
 * inteiro. Uma linha esquecida sem `await` em qualquer canto — um e-mail que
 * não saiu, um upload que falhou — tirava o portal do ar para todos os
 * usuários. Registrar o erro e continuar servindo é sempre melhor: o pedaço
 * que falhou já falhou de qualquer jeito.
 *
 * A exceção não capturada é mais grave, porque o processo pode ter ficado num
 * estado quebrado. Aí a saída é sair — com código de erro, para o provedor
 * subir um processo novo — menos quando é só a rede de alguém que caiu.
 */
export function protegerProcesso(sair: (codigo: number) => void = code => process.exit(code)) {
  process.on("unhandledRejection", motivo => {
    console.error("[Processo] promessa rejeitada sem tratamento (o servidor continua de pé):", motivo);
  });
  process.on("uncaughtException", erro => {
    if (erroDeRede(erro)) {
      console.warn("[Processo] conexão interrompida pelo outro lado:", (erro as { code?: string }).code);
      return;
    }
    console.error("[Processo] exceção não capturada — encerrando para subir limpo:", erro);
    sair(1);
  });
}

/**
 * Os tempos das conexões, alinhados com o proxy do provedor.
 *
 * O proxy reaproveita a conexão com o nosso processo. Se nós a fecharmos antes
 * dele, ele manda uma requisição por um cano que acabou de fechar e o usuário
 * recebe 502 sem nenhum erro do nosso lado. Por isso o nosso tempo de espera é
 * maior que o dele (que costuma ser 60 segundos), e o de cabeçalho é maior
 * ainda, como o Node exige.
 */
export function ajustarTemposDoServidor(server: Server) {
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  // Requisição que passa de dois minutos não vai terminar bem: a importação de
  // acervo, que é a mais demorada, roda em muito menos que isso.
  server.requestTimeout = 120_000;
}

/** Quanto tempo a saída espera pelas requisições que já estavam em andamento. */
export const PRAZO_DO_DESLIGAMENTO = 15_000;

/**
 * Sair sem derrubar quem está no meio de uma requisição.
 *
 * Todo deploy manda um SIGTERM. Sem tratar, o processo morre na hora e quem
 * estava salvando um agendamento recebe erro de conexão — e não sabe se salvou.
 * Aqui o servidor para de aceitar conexão nova, deixa as que estão em andamento
 * terminarem, fecha o banco e só então sai. O prazo existe para uma requisição
 * travada não segurar o desligamento para sempre.
 */
export function desligarComCalma(server: Server, sair: (codigo: number) => void = code => process.exit(code)) {
  let desligando = false;
  const encerrar = (sinal: string) => {
    if (desligando) return;
    desligando = true;
    console.log(`[Servidor] ${sinal} recebido — encerrando com calma.`);
    const prazo = setTimeout(() => {
      console.error("[Servidor] o prazo acabou com requisições ainda abertas — saindo assim mesmo.");
      sair(1);
    }, PRAZO_DO_DESLIGAMENTO);
    prazo.unref();
    server.close(() => {
      void fecharBanco().finally(() => {
        clearTimeout(prazo);
        sair(0);
      });
    });
    // As conexões que o proxy mantém abertas sem estar usando segurariam o
    // fechamento até o keep-alive expirar.
    server.closeIdleConnections?.();
  };
  process.on("SIGTERM", () => encerrar("SIGTERM"));
  process.on("SIGINT", () => encerrar("SIGINT"));
}

/**
 * Corpo grande de quem nem sequer fez login.
 *
 * Só duas telas mandam arquivo grande, e as duas são de administrador: a
 * importação do acervo e a dos pedidos do SAP. O limite do corpo, porém, é
 * aplicado antes de qualquer verificação de quem é a pessoa — então, sem isto,
 * qualquer um na internet pode obrigar o servidor a segurar dezenas de
 * megabytes na memória, repetidas vezes, até ele ficar sem memória.
 *
 * Quem tem sessão continua com o limite cheio. Quem não tem não tem por que
 * mandar mais que alguns megabytes: o maior corpo anônimo legítimo é um login.
 */
export const LIMITE_SEM_SESSAO = 4 * 1024 * 1024;

export function corpoGrandeDemaisSemSessao({ temSessao, tamanho }: { temSessao: boolean; tamanho: number | null }): boolean {
  if (temSessao || tamanho === null) return false;
  return tamanho > LIMITE_SEM_SESSAO;
}

export function limitarCorpoAnonimo(req: Request, res: Response, next: NextFunction) {
  const bruto = req.headers["content-length"];
  const tamanho = bruto === undefined ? null : Number(bruto);
  const grande = corpoGrandeDemaisSemSessao({
    // O nome tem que começar onde um cookie começa: um cookie chamado
    // "xrvd_saude_session" não é sessão nenhuma.
    temSessao: new RegExp(`(?:^|;\\s*)${RVD_SESSION_COOKIE}=`).test(req.headers.cookie ?? ""),
    tamanho: Number.isFinite(tamanho) ? tamanho : null,
  });
  if (!grande) return next();
  res.status(413).json({ error: "Faça login para enviar arquivos deste tamanho." });
}

/**
 * A saúde do processo, em duas perguntas diferentes.
 *
 * `/api/vivo` responde sem tocar em nada: serve para o provedor saber se o
 * processo respira. `/api/saude` também pergunta ao banco, porque processo de
 * pé com banco inalcançável serve erro em toda tela — e é isso que o deploy
 * precisa saber antes de mandar as pessoas para a versão nova.
 *
 * A resposta do banco fica guardada por alguns segundos para que ninguém
 * transforme a verificação de saúde em carga sobre o banco.
 */
export const VALIDADE_DA_SAUDE = 5_000;

export function registrarSaude(app: Express, agora: () => number = Date.now) {
  let ultima = { em: 0, ok: false };
  app.get("/api/vivo", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/api/saude", async (_req, res) => {
    const instante = agora();
    if (instante - ultima.em > VALIDADE_DA_SAUDE) {
      ultima = { em: instante, ok: await bancoRespondendo() };
    }
    res.status(ultima.ok ? 200 : 503).json({ ok: ultima.ok, banco: ultima.ok ? "ok" : "indisponível" });
  });
}

/**
 * O erro escrito no log em uma linha, e não o objeto inteiro.
 *
 * Quando o corpo de uma requisição não é JSON válido, o express monta um erro
 * que carrega o corpo recebido dentro dele. Imprimir esse erro como objeto
 * despeja o corpo inteiro no log — dezenas de megabytes de uma importação, ou o
 * conteúdo de uma nota fiscal, numa linha só. O que ajuda a investigar é a
 * mensagem e a pilha; o corpo não.
 */
export function resumoDoErro(erro: unknown): string {
  if (!(erro instanceof Error)) return String(erro);
  return erro.stack ?? `${erro.name}: ${erro.message}`;
}

/**
 * O último anteparo das rotas que não são tRPC.
 *
 * Sem ele, o Express responde com a pilha de chamadas do erro em texto puro —
 * que conta a quem estiver olhando os caminhos internos do servidor. A pilha
 * tem que ir para o log, onde é útil, e não para a tela.
 */
export function tratadorDeErros(erro: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(erro);
  console.error("[HTTP] erro não tratado na rota:", resumoDoErro(erro));
  const status = (erro as { status?: number; statusCode?: number } | null)?.status ?? (erro as { statusCode?: number } | null)?.statusCode;
  // O express já classifica corpo grande demais e JSON inválido. Repassar esse
  // status conta ao cliente o que ele pode corrigir, em vez de um 500 genérico.
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? "Arquivo grande demais." : "Requisição inválida." });
    return;
  }
  res.status(500).json({ error: "Erro interno do servidor." });
}
