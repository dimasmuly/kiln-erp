import { describe, expect, it } from "vitest";

import { mulDivRound, parseMoneyInput, toMoneyInput } from "@/domain/money";

describe("mulDivRound", () => {
  it("rounds half away from zero", () => {
    expect(mulDivRound(5, 1, 2)).toBe(3);
    expect(mulDivRound(-5, 1, 2)).toBe(-3);
    expect(mulDivRound(4, 1, 3)).toBe(1);
    expect(mulDivRound(5, 1, 3)).toBe(2);
  });

  it("computes PPN without float error", () => {
    // 11% of Rp 1.234.567,89 = Rp 135.802,4679 → 135.802,47
    expect(mulDivRound(123_456_789, 1100, 10_000)).toBe(13_580_247);
  });

  it("does not overflow on large intermediates", () => {
    const value = 9_000_000_000_000; // Rp 90 billion in sen
    expect(mulDivRound(value, 999_999, 1_000_000)).toBe(8_999_991_000_000);
  });

  it("rejects division by zero", () => {
    expect(() => mulDivRound(1, 1, 0)).toThrow(RangeError);
  });
});

describe("money input", () => {
  it.each([
    ["1250000", 125_000_000],
    ["1250000.5", 125_000_050],
    ["0.07", 7],
    [" 42 ", 4200],
  ])("parses %j", (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each(["", "-1", "1,5", "1.234.567", "1.234", "abc", "1e5"])("rejects %j", (input) => {
    expect(parseMoneyInput(input)).toBeNull();
  });

  it("round-trips through the form representation", () => {
    for (const v of [0, 7, 100, 125_000_050, 99_999_999]) expect(parseMoneyInput(toMoneyInput(v))).toBe(v);
  });
});
