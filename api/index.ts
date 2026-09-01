import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { createContext } from "../server/_core/context";
import { ENV } from "../server/_core/env";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { logStorageConfig } from "../server/_core/s3Client";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { appRouter } from "../server/routers";

/**
 * Entrada da Vercel. O mesmo app Express de `server/_core/index.ts`, sem o
 * `listen` e sem servir arquivos estáticos: na Vercel o cliente compilado é
 * publicado na CDN e só as rotas de API chegam a esta função.
 *
 * Cada invocação fria monta o app de novo, então nada aqui pode guardar estado
 * entre requisições — a conexão do banco é criada sob demanda em `server/db.ts`
 * e reaproveitada enquanto a instância continuar quente.
 */

// Sem o segredo, os cookies de sessão seriam assinados com um valor público do
// repositório e qualquer pessoa poderia se passar por qualquer usuário. Falhar
// no deploy é melhor do que servir sem controle de acesso.
if (ENV.isProduction && !ENV.cookieSecret) {
  throw new Error(
    "JWT_SECRET não está configurado. Defina a variável de ambiente no projeto da Vercel antes de publicar."
  );
}

const app = express();

app.use(express.json({ limit: "4.5mb" }));
app.use(express.urlencoded({ limit: "4.5mb", extended: true }));

logStorageConfig();
registerStorageProxy(app);
registerOAuthRoutes(app);

app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

// Uma rota de API não atendida nunca deve devolver HTML: o cliente espera JSON
// e um fallback quebraria o parse com um erro sem relação com a causa.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

export default app;
