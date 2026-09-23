import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { logStorageConfig, probeStorage } from "./s3Client";
import { ENV } from "./env";
import { migrarNaSubida } from "./migrations";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Session cookies fall back to a constant that lives in this repository, which
// is the right default for a local checkout and a forgeable one in production:
// anyone who can read the source could mint a cookie for any user. Refuse to
// serve rather than serve without access control.
function assertSessionSecret() {
  if (ENV.isProduction && !ENV.cookieSecret) {
    console.error(
      "[Auth] JWT_SECRET nao esta configurado. Sem ele, os cookies de login seriam " +
        "assinados com um valor publico do repositorio e qualquer pessoa poderia se " +
        "passar por qualquer usuario. Defina JWT_SECRET (texto longo e aleatorio) " +
        "nas variaveis de ambiente e suba de novo.",
    );
    throw new Error("JWT_SECRET is required in production");
  }
  if (!ENV.cookieSecret) {
    console.warn("[Auth] JWT_SECRET ausente — usando segredo de desenvolvimento.");
  }
}

/**
 * Os cabeçalhos que o navegador obedece.
 *
 * São baratos e cobrem três coisas que não dependem do nosso código: adivinhar
 * o tipo de um arquivo servido (nosniff), abrir o portal dentro de um iframe de
 * terceiro para roubar cliques (frame-ancestors), e vazar o endereço interno
 * que a pessoa estava vendo ao clicar num link para fora (referrer).
 *
 * Em produção entra também o HSTS, que manda o navegador nunca mais tentar
 * http:// neste domínio. Ele fica de fora em desenvolvimento, onde o acesso é
 * por http mesmo e a regra ficaria gravada no navegador de quem programa.
 */
function cabecalhosDeSeguranca(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (ENV.isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

async function startServer() {
  assertSessionSecret();
  // Antes de atender qualquer requisição: o banco precisa estar na versão que
  // este código espera. Subir com o banco atrasado publica telas que quebram
  // ao ler uma coluna que ainda não existe.
  await migrarNaSubida();
  const app = express();
  // Atrás do proxy do hosting, req.ip é o do proxy para todo mundo. Sem isto, o
  // freio de tentativas de login contaria o mundo inteiro como um visitante só
  // — e bloquearia todo mundo junto.
  app.set("trust proxy", 1);
  const server = createServer(app);
  app.use(cabecalhosDeSeguranca);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  logStorageConfig();
  void probeStorage();
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Nunca encaminhar uma rota de API não atendida para o fallback HTML do
  // Vite. Isso mantém o contrato JSON do cliente e evita erros de parse.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(erro => {
  // Sair com erro, e não só imprimir: um processo que termina com código 0 sem
  // ter aberto porta nenhuma parece subida bem-sucedida para o provedor, que
  // então tira do ar a versão que estava funcionando. Falhar alto mantém a
  // anterior no ar até o problema ser resolvido.
  console.error("[Servidor] Falhou ao subir:", erro);
  process.exit(1);
});
