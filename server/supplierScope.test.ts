import { describe, expect, it } from "vitest";
import { buildScopeIds, companyKey, isWithinScope, shouldScopeByCompany } from "./supplierScope";

describe("supplier company scope", () => {
  it("treats the same CNPJ as one company regardless of formatting", () => {
    expect(companyKey("06.033.403/0001-13")).toBe("06033403000113");
    expect(companyKey("06033403000113")).toBe("06033403000113");
  });

  it("refuses to group logins that have no usable CNPJ", () => {
    for (const value of [null, undefined, "", "   ", "123", "abc"]) {
      expect(companyKey(value)).toBeNull();
      expect(shouldScopeByCompany(value)).toBe(false);
    }
  });

  it("refuses to group the all-zeros placeholder CNPJ", () => {
    // Seeded accounts carry this value; grouping them would join unrelated logins.
    expect(companyKey("00000000000000")).toBeNull();
    expect(shouldScopeByCompany("00000000000000")).toBe(false);
  });

  it("groups by a real CNPJ", () => {
    expect(shouldScopeByCompany("06.033.403/0001-13")).toBe(true);
  });

  it("always keeps the caller inside their own scope", () => {
    expect(buildScopeIds(7, [])).toEqual([7]);
    expect(buildScopeIds(7, [3, 9])).toEqual([7, 3, 9]);
  });

  it("does not repeat the caller when the company list already has them", () => {
    expect(buildScopeIds(7, [7, 3])).toEqual([7, 3]);
  });

  it("allows only appointments belonging to the scope", () => {
    const scope = buildScopeIds(7, [3]);
    expect(isWithinScope(scope, 7)).toBe(true);
    expect(isWithinScope(scope, 3)).toBe(true);
    expect(isWithinScope(scope, 8)).toBe(false);
  });

  it("rejects an appointment with no owner", () => {
    expect(isWithinScope([7], null)).toBe(false);
    expect(isWithinScope([7], undefined)).toBe(false);
  });
});
