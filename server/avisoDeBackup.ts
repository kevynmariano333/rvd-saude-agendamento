/**
 * O e-mail que avisa quando o backup parou.
 *
 * O backup roda sozinho de madrugada e grava o resultado numa tabela — o que
 * resolve metade do problema. A outra metade é que o resultado só aparece para
 * quem abre a tela de manutenção, e ninguém abre a tela de manutenção enquanto
 * está tudo bem. Um backup quebrado ficaria semanas assim: painel verde, bucket
 * parado, e a descoberta no dia em que o banco sumisse.
 *
 * Então o sistema avisa. Não na primeira falha — uma noite ruim acontece, o
 * bucket recusa, a rede cai, e e-mail por isso vira e-mail que se ignora. Duas
 * noites seguidas sem backup bom já não é acaso: é alguma coisa quebrada que
 * vai continuar quebrada até alguém mexer.
 */

import { MARCA } from "../shared/marca";

/**
 * Duas noites sem backup que prestasse.
 *
 * Quarenta e seis horas, e não quarenta e oito: o backup sai às três da manhã,
 * e dois dias exatos deixariam o aviso na fronteira do horário — bastaria o
 * backup atrasar alguns minutos para o aviso pular um dia inteiro.
 */
export const IDADE_LIMITE_MS = 46 * 60 * 60 * 1000;

/** Enquanto o problema durar, um aviso por dia. Mais que isso é ruído. */
export const INTERVALO_ENTRE_AVISOS_MS = 24 * 60 * 60 * 1000;

export type SituacaoDoBackup = {
  agora: Date;
  /** O último backup que terminou bem. Nulo quando nunca houve um. */
  ultimoSucessoEm: Date | null;
  /** A primeira tentativa registrada, boa ou ruim. É a régua de quem nunca teve sucesso. */
  primeiraTentativaEm: Date | null;
  /** Quando o aviso saiu da última vez. */
  ultimoAvisoEm: Date | null;
};

/**
 * Está na hora de avisar?
 *
 * A conta é feita a partir do último backup bom. Quando nunca houve um, vale a
 * primeira tentativa: um sistema que tenta há três dias e nunca conseguiu está
 * tão desprotegido quanto o que conseguia e parou — a diferença é só que o
 * segundo já teve sorte alguma vez.
 *
 * Sem tentativa nenhuma o aviso não sai. Não é omissão: é um sistema que acabou
 * de subir, e avisar ali seria avisar sobre o nada.
 */
export function deveAvisarDoBackup(situacao: SituacaoDoBackup): boolean {
  const referencia = situacao.ultimoSucessoEm ?? situacao.primeiraTentativaEm;
  if (!referencia) return false;
  if (situacao.agora.getTime() - referencia.getTime() < IDADE_LIMITE_MS) return false;
  if (situacao.ultimoAvisoEm && situacao.agora.getTime() - situacao.ultimoAvisoEm.getTime() < INTERVALO_ENTRE_AVISOS_MS) return false;
  return true;
}

/** Quantos dias inteiros se passaram — é assim que a frase fica legível. */
export function diasDesde(agora: Date, quando: Date): number {
  return Math.floor((agora.getTime() - quando.getTime()) / (24 * 60 * 60 * 1000));
}

function dataPorExtenso(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(quando);
}

function escapar(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type DadosDoAviso = {
  agora: Date;
  ultimoSucessoEm: Date | null;
  /** A mensagem de erro da última tentativa, quando houve uma. */
  ultimoErro: string | null;
  /** Endereço do portal, sem barra no fim. Sem ele, o e-mail vai sem link. */
  appUrl: string | null;
};

/**
 * O texto do aviso.
 *
 * Diz o que parou, desde quando, o que o sistema viu de erro e o que fazer —
 * nessa ordem, porque quem abre um e-mail desses às sete da manhã precisa
 * decidir em dez segundos se larga o café.
 */
export function conteudoDoAvisoDeBackup(dados: DadosDoAviso): { subject: string; html: string; text: string } {
  const dias = dados.ultimoSucessoEm ? diasDesde(dados.agora, dados.ultimoSucessoEm) : 0;
  const desde = dados.ultimoSucessoEm
    ? `O último backup que deu certo foi em ${dataPorExtenso(dados.ultimoSucessoEm)} — faz ${dias} ${dias === 1 ? "dia" : "dias"}.`
    : "Nenhum backup chegou a dar certo até agora.";
  const erro = dados.ultimoErro ? `O sistema registrou este erro: ${dados.ultimoErro}` : "A rotina não registrou erro — ela pode nem estar chegando a rodar.";
  // O quadro do sistema mora na tela de Acessos, que é por onde o administrador
  // já passa. Mandar para lá é mandar para onde a resposta está.
  const link = dados.appUrl ? `${dados.appUrl}/operador/acessos` : null;
  const passos = [
    "Abra Acessos no portal e procure o quadro \"Backup do banco\": ele mostra a última tentativa e o erro dela.",
    "Clique em \"Gerar backup agora\": se falhar de novo, o erro aparece na hora, com a mensagem do provedor.",
    "No Railway, confira se as variáveis do bucket (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) continuam lá.",
  ];

  const text = [
    `O backup do ${MARCA.nome} parou`,
    "",
    desde,
    erro,
    "",
    "O que fazer:",
    ...passos.map(passo => `- ${passo}`),
    ...(link ? ["", `Quadro do sistema: ${link}`] : []),
    "",
    "Enquanto isso não voltar, os dados do portal existem num lugar só.",
    "",
    "Esta mensagem é automática — não responda a este e-mail.",
  ].join("\n");

  const botao = link
    ? `<p style="margin:26px 0 0"><a href="${escapar(link)}" style="display:inline-block;background:#782078;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:13px 26px;border-radius:12px">Abrir o quadro do sistema</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:32px 16px;background:#f6f4f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#782078;padding:24px 28px">
          <p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold">${MARCA.nome}</p>
          <p style="margin:6px 0 0;color:#c9e1ee;font-size:12px;letter-spacing:1.6px;text-transform:uppercase">${MARCA.descricao}</p>
        </td></tr>
        <tr><td style="padding:30px 28px">
          <h1 style="margin:0;color:#782078;font-size:22px">O backup parou</h1>
          <p style="margin:16px 0 0;color:#3f3244;font-size:15px;line-height:1.6">${escapar(desde)}</p>
          <p style="margin:12px 0 0;color:#3f3244;font-size:14px;line-height:1.6">${escapar(erro)}</p>
          <p style="margin:26px 0 8px;color:#7a6f7e;font-size:12px;text-transform:uppercase;letter-spacing:1px">O que fazer</p>
          <ul style="margin:0;padding-left:20px;color:#3f3244;font-size:14px;line-height:1.7">${passos.map(passo => `<li>${escapar(passo)}</li>`).join("")}</ul>
          ${botao}
          <p style="margin:24px 0 0;color:#7a6f7e;font-size:13px;line-height:1.6">Enquanto isso não voltar, os dados do portal existem num lugar só.</p>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#faf7fa;color:#9a8f9e;font-size:12px">Esta mensagem é automática — não responda a este e-mail.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: `O backup do ${MARCA.nome} parou`, html, text };
}
