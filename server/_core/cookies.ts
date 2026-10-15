import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  return {
    httpOnly: true,
    path: "/",
    // "lax" e não "none": com "none" o navegador mandava o cookie de sessão
    // junto de requisições partidas de qualquer outro site, que é o que abre
    // espaço para alguém disparar uma ação no portal em nome de quem está
    // logado. Com "lax" ele só vai nas requisições do próprio portal e nos
    // links que a pessoa clica para chegar aqui — que é tudo o que o portal
    // precisa, inclusive o link do comprovante e o de redefinir senha.
    //
    // O portal não é embutido em site nenhum (o cabeçalho frame-ancestors já
    // proíbe), então não há nada do outro lado para quebrar.
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
