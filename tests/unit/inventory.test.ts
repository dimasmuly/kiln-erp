import { describe, expect, it } from "vitest";

import { averageUnitCost, issue, receive, type CostPosition } from "@/domain/inventory";

describe("weighted-average costing", () => {
  it("averages receipts at different costs", () => {
    let p: CostPosition = { onHand: 0, value: 0 };
    p = receive(p, 10, 1000);
    p = receive(p, 30, 2000);
    expect(p).toEqual({ onHand: 40, value: 70_000 });
    expect(averageUnitCost(p)).toBe(1750);
  });

  it("issuing the last unit removes exactly the remaining value", () => {
    // 3 units worth 1000 total: 333.33… each, which no rounded unit cost can represent.
    let p = receive({ onHand: 0, value: 0 }, 3, 333);
    p = { ...p, value: p.value + 1 }; // 1000 total
    const a = issue(p, 1);
    const b = issue(a.position, 1);
    const c = issue(b.position, 1);
    expect(a.cost + b.cost + c.cost).toBe(1000);
    expect(c.position).toEqual({ onHand: 0, value: 0 });
  });

  it("never drifts: random histories keep value consistent and end at zero", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    for (let run = 0; run < 200; run++) {
      let p: CostPosition = { onHand: 0, value: 0 };
      let valueIn = 0;
      let valueOut = 0;
      for (let step = 0; step < 50; step++) {
        if (p.onHand === 0 || rand() < 0.45) {
          const qty = 1 + Math.floor(rand() * 20);
          const cost = Math.floor(rand() * 1_000_000);
          p = receive(p, qty, cost);
          valueIn += qty * cost;
        } else {
          const r = issue(p, 1 + Math.floor(rand() * p.onHand));
          p = r.position;
          valueOut += r.cost;
          expect(r.cost).toBeGreaterThanOrEqual(0);
        }
        expect(p.value).toBeGreaterThanOrEqual(0);
        expect(valueIn - valueOut).toBe(p.value);
      }
      if (p.onHand > 0) valueOut += issue(p, p.onHand).cost;
      expect(valueOut).toBe(valueIn);
    }
  });

  it("refuses to issue more than is on hand", () => {
    expect(() => issue({ onHand: 2, value: 10 }, 3)).toThrow(/only 2 on hand/);
  });
});
