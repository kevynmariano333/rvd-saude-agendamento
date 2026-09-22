/**
 * Onde cada legenda aparece DENTRO do vídeo.
 *
 * O relógio da gravação não é o relógio do arquivo: o navegador entrega os
 * quadros no ritmo que consegue, e o vídeo sai esticado — uma legenda marcada
 * aos 83 segundos de gravação aparece aos 90 do arquivo. Colocar a narração
 * pelos tempos da gravação faz a voz atrasar cada vez mais até o fim.
 *
 * Então, em vez de confiar no relógio, isto olha o próprio vídeo: recorta a
 * faixa da legenda e pergunta ao ffmpeg em que instantes aquela faixa mudou.
 */

import { execFileSync, spawnSync } from "node:child_process";

/** Instantes em que a faixa da legenda mudou, uma marca por troca. */
function trocasDaFaixa(webm) {
  // O showinfo do ffmpeg sai pela saída de erro, não pela padrão.
  const execucao = spawnSync("ffmpeg", ["-hide_banner", "-i", webm, "-vf", "crop=1280:64:0:656,select='gt(scene,0.05)',showinfo", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const instantes = [...`${execucao.stdout ?? ""}${execucao.stderr ?? ""}`.matchAll(/pts_time:([0-9.]+)/g)].map(achado => Number(achado[1])).sort((a, b) => a - b);
  // Uma troca rende várias detecções seguidas — o texto entra, a página
  // recarrega, a barra reaparece. Só a primeira de cada rajada é o evento.
  return instantes.filter((instante, indice) => indice === 0 || instante - instantes[indice - 1] > 1.2);
}

function duracaoDe(arquivo) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arquivo], { encoding: "utf8" }).trim());
}

/** Cada marca recebe a troca mais próxima do palpite, sem voltar no tempo. */
function casar(marcas, trocas, palpitar) {
  const casadas = [];
  let anterior = -1;
  for (const marca of marcas) {
    const palpite = palpitar(marca.inicio / 1000);
    const candidatas = trocas.filter(instante => instante > anterior);
    const perto = candidatas.length ? candidatas.reduce((melhor, instante) => (Math.abs(instante - palpite) < Math.abs(melhor - palpite) ? instante : melhor)) : palpite;
    // Longe demais de qualquer troca: a legenda entrou numa hora em que a tela
    // já estava mudando por outro motivo, e o palpite vale mais que a detecção.
    casadas.push({ id: marca.id, gravacao: marca.inicio / 1000, video: Math.abs(perto - palpite) < 3 ? perto : palpite });
    anterior = casadas[casadas.length - 1].video;
  }
  return casadas;
}

/** A reta que leva do relógio da gravação ao relógio do vídeo. */
function ajustarReta(casadas) {
  const n = casadas.length;
  const somaX = casadas.reduce((total, item) => total + item.gravacao, 0);
  const somaY = casadas.reduce((total, item) => total + item.video, 0);
  const somaXY = casadas.reduce((total, item) => total + item.gravacao * item.video, 0);
  const somaXX = casadas.reduce((total, item) => total + item.gravacao * item.gravacao, 0);
  const inclinacao = (n * somaXY - somaX * somaY) / (n * somaXX - somaX * somaX);
  return { inclinacao, base: (somaY - inclinacao * somaX) / n };
}

/**
 * Casa as marcas da gravação com os instantes do vídeo.
 *
 * A primeira passada usa a escala grosseira — a duração do arquivo sobre a da
 * gravação — e erra justamente onde a tela mudou por outro motivo. A segunda
 * usa a reta ajustada sobre o que a primeira acertou, que é boa o bastante para
 * a marca teimosa cair na troca certa.
 */
export function medirLegendas(webm, marcas) {
  const trocas = trocasDaFaixa(webm);
  const duracao = duracaoDe(webm);
  const escala = duracao / (marcas[marcas.length - 1].inicio / 1000 + 8);

  const primeira = casar(marcas, trocas, segundos => segundos * escala);
  const reta = ajustarReta(primeira);
  return casar(marcas, trocas, segundos => reta.inclinacao * segundos + reta.base);
}
