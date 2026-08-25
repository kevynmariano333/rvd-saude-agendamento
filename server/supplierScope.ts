// Which appointments a supplier login is allowed to see.
//
// Logins belonging to the same company (same CNPJ) share the company's
// appointments. A login with no CNPJ on file — or one whose CNPJ is blank or
// malformed — sees only what it sent itself: grouping those together would put
// unrelated accounts in one bucket, which is the exact leak this scoping exists
// to prevent.

import { normalizeCnpj } from "./fiscalFilters";

const CNPJ_DIGITS = 14;

export function companyKey(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== CNPJ_DIGITS) return null;
  // A CNPJ of all zeros is the placeholder used by seeded accounts, not a real
  // company, so it must never gather logins together.
  if (/^0+$/.test(digits)) return null;
  return digits;
}

export function shouldScopeByCompany(cnpj: string | null | undefined): boolean {
  return companyKey(cnpj) !== null;
}

/**
 * The caller is always in their own scope, even if the company lookup returns
 * nothing — a failed or empty lookup must never widen access, and must never
 * lock a supplier out of their own records either.
 */
export function buildScopeIds(selfId: number, companyUserIds: number[]): number[] {
  return Array.from(new Set([selfId, ...companyUserIds]));
}

export function isWithinScope(scopeIds: number[], supplierId: number | null | undefined): boolean {
  if (supplierId === null || supplierId === undefined) return false;
  return scopeIds.includes(supplierId);
}
