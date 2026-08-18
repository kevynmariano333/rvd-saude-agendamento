import { describe, expect, it } from "vitest";
import { getUnscheduledReceiptRegisteredAt } from "./receiptTiming";

describe("data do recebimento avulso", () => {
  it("usa o instante de registro do XML, sem depender da data de emissão da nota", () => {
    const registeredAt = new Date("2031-04-02T14:35:00.000Z");
    expect(getUnscheduledReceiptRegisteredAt(registeredAt)).toEqual(registeredAt);
  });
});
