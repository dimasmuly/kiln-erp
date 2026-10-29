import { assertMoney, mulDivRound, type Money } from "./money";

/**
 * Perpetual weighted-average costing, tracked as *total value* per product
 * rather than as a rounded unit cost.
 *
 * Storing a rounded average and multiplying it back out drifts by a few sen
 * on every issue, so the inventory sub-ledger slowly stops matching the
 * Inventory account in the general ledger. Tracking value instead means each
 * issue removes `value × qty / onHand` (rounded once), and issuing the last
 * unit removes exactly the remaining value. The sub-ledger and the GL
 * reconcile to the sen, forever.
 */
export interface CostPosition {
  onHand: number;
  value: Money;
}

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

/** Unit cost implied by a position, for display and for valuing count gains. */
export function averageUnitCost(position: CostPosition): Money {
  return position.onHand === 0 ? 0 : mulDivRound(position.value, 1, position.onHand);
}

export function receive(position: CostPosition, qty: number, unitCost: Money): CostPosition {
  if (!Number.isInteger(qty) || qty <= 0) throw new InventoryError("Received quantity must be a positive integer.");
  assertMoney(unitCost, "unit cost");
  if (unitCost < 0) throw new InventoryError("Unit cost cannot be negative.");
  const value = position.value + qty * unitCost;
  assertMoney(value, "inventory value");
  return { onHand: position.onHand + qty, value };
}

/** Removes `qty` units and returns the cost of what was removed. */
export function issue(position: CostPosition, qty: number): { position: CostPosition; cost: Money } {
  if (!Number.isInteger(qty) || qty <= 0) throw new InventoryError("Issued quantity must be a positive integer.");
  if (qty > position.onHand) {
    throw new InventoryError(`Cannot issue ${qty} units; only ${position.onHand} on hand.`);
  }
  const cost = qty === position.onHand ? position.value : mulDivRound(position.value, qty, position.onHand);
  return { position: { onHand: position.onHand - qty, value: position.value - cost }, cost };
}

/** Units that can still be promised to new orders in one warehouse. */
export function available(level: { onHand: number; reserved: number }): number {
  return level.onHand - level.reserved;
}
