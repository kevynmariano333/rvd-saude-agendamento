import type { Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../drizzle/schema";
import { getUserById } from "./db";
import { ENV } from "./_core/env";

export const RVD_SESSION_COOKIE = "rvd_saude_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret || "rvd-saude-local-session");
}

function getCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  return cookieHeader
    .split(";")
    .map(item => item.trim())
    .find(item => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function createRvdSession(response: Response, user: User) {
  const token = await new SignJWT({ role: user.role, source: "rvd-saude" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());

  response.cookie(RVD_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: ENV.isProduction,
    maxAge: SESSION_DURATION_SECONDS * 1000,
    path: "/",
  });
}

export async function getRvdSessionUser(request: Request): Promise<User | null> {
  const token = getCookieValue(request.headers.cookie, RVD_SESSION_COOKIE);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0) return null;
    return (await getUserById(id)) ?? null;
  } catch {
    return null;
  }
}

export function clearRvdSession(response: Response) {
  response.clearCookie(RVD_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: ENV.isProduction,
    path: "/",
  });
}
