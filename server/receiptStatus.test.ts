import { describe, expect, it } from "vitest";
import { getReceiptTimestampForStatus } from "./receiptStatus";

describe("persistência do recebimento", () => {
  it("gera a data de recebimento somente na transição para Recebido", () => {
    const now = new Date("2030-09-01T13:37:00.000Z");
    expect(getReceiptTimestampForStatus("received", now)).toBe(now);
    expect(getReceiptTimestampForStatus("scheduled", now)).toBeUndefined();
  });
});
