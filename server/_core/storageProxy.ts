import type { Express } from "express";
import { storageGetSignedUrl } from "../storage";
import { getRvdSessionUser } from "../session";
import { isS3Configured } from "./s3Client";

/**
 * Únicos prefixos que o proxy entrega. O bucket guarda mais do que os anexos das
 * notas — os backups do banco vão para `backups/`, por exemplo — e um proxy que
 * serve qualquer chave transforma um nome previsível em download público. A
 * lista é de permissão, e não de bloqueio, para que o que for guardado ali
 * amanhã não fique exposto por esquecimento.
 */
const PREFIXOS_PERMITIDOS = ["agendamentos-xml/", "recebimentos-avulsos/"];

export function chavePermitida(chave: string): boolean {
  // Uma chave com ".." poderia sair do prefixo depois de normalizada pelo S3.
  if (chave.includes("..")) return false;
  return PREFIXOS_PERMITIDOS.some(prefixo => chave.startsWith(prefixo));
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Os anexos são documentos fiscais de fornecedores: exigem sessão. Antes
    // bastava conhecer a chave, o que deixava o sigilo por conta da parte
    // aleatória do nome do arquivo.
    const user = await getRvdSessionUser(req);
    if (!user) {
      res.status(401).send("Faça login para acessar este arquivo.");
      return;
    }

    if (!chavePermitida(key)) {
      // Mesma resposta de arquivo inexistente: quem tenta adivinhar um caminho
      // não deve descobrir que ele existe mas é de outra natureza.
      res.status(404).send("Arquivo não encontrado.");
      return;
    }

    if (!isS3Configured()) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const url = await storageGetSignedUrl(key);
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
