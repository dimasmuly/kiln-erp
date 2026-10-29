import { describe, expect, it } from "vitest";

import { can } from "@/server/auth/rbac";
import { agingBucket, assertSalesTransition, canTransitionPurchase, canTransitionSales, TransitionError } from "@/domain/workflow";

describe("document lifecycles", () => {
  it("sales orders move forward one step at a time", () => {
    expect(canTransitionSales("draft", "confirmed")).toBe(true);
    expect(canTransitionSales("confirmed", "delivered")).toBe(true);
    expect(canTransitionSales("draft", "delivered")).toBe(false);
    expect(canTransitionSales("delivered", "cancelled")).toBe(false);
    expect(canTransitionSales("paid", "draft")).toBe(false);
  });

  it("purchase orders can be cancelled until goods arrive", () => {
    expect(canTransitionPurchase("ordered", "cancelled")).toBe(true);
    expect(canTransitionPurchase("received", "cancelled")).toBe(false);
  });

  it("explains rejected transitions", () => {
    expect(() => assertSalesTransition("SO-1", "invoiced", "confirmed")).toThrow(TransitionError);
  });
});

describe("aging", () => {
  it.each([
    ["2026-10-29", "current"],
    ["2026-10-28", "1-30"],
    ["2026-09-29", "1-30"],
    ["2026-09-28", "31-60"],
    ["2026-08-30", "31-60"],
    ["2026-08-29", "61-90"],
    ["2026-07-01", "90+"],
  ])("due %s is %s on 2026-10-29", (due, bucket) => {
    expect(agingBucket(due, "2026-10-29")).toBe(bucket);
  });
});

describe("segregation of duties", () => {
  it("only finance and admin can take payments", () => {
    expect(can("finance", "sales.payment")).toBe(true);
    expect(can("sales", "sales.payment")).toBe(false);
    expect(can("warehouse", "sales.payment")).toBe(false);
  });

  it("whoever creates sales orders cannot ship or invoice them", () => {
    expect(can("sales", "sales.write")).toBe(true);
    expect(can("sales", "sales.deliver")).toBe(false);
    expect(can("sales", "sales.invoice")).toBe(false);
  });
});
