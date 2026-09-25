import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { realtimeQueryDefaults } from "./lib/realtime";
import { isUnexpectedHtmlApiResponse, mensagemDeRespostaNaoJson } from "./lib/apiResponse";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      ...realtimeQueryDefaults,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      async fetch(input, init) {
        const headers = new Headers(init?.headers);
        headers.set("Accept", "application/json");
        const requestInit: RequestInit = {
          ...(init ?? {}),
          credentials: "include",
          headers,
        };
        let response = await globalThis.fetch(input, requestInit);

        // Durante reconexões do ambiente de desenvolvimento, o fallback do
        // aplicativo pode responder uma única vez com index.html. Consultas
        // GET podem ser repetidas com segurança para obter o JSON da API.
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "GET" && isUnexpectedHtmlApiResponse(response)) {
          await new Promise(resolve => setTimeout(resolve, 150));
          response = await globalThis.fetch(input, requestInit);
        }

        // Resposta que não é da API é do proxy da hospedagem — servidor
        // reiniciando, ou a requisição passou do tempo dele. Vira um erro com
        // texto de gente; sem isto, a tela tentava ler "upstream error" como
        // JSON e mostrava "Unexpected token 'u'".
        const aviso = mensagemDeRespostaNaoJson(response);
        if (aviso) throw new Error(aviso);

        return response;
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
