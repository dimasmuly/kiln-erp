# ADR-0003: Integer minor units; weighted-average costing tracked as total value

**Status:** accepted

## Money

All amounts are `bigint` columns holding minor units (sen, 1/100 IDR), and are plain integers in TypeScript (safe up to about Rp 90 trillion). Rounding happens in exactly one function, `mulDivRound(a, b, c)`. It computes `a × b / c` with `BigInt` and rounds half away from zero. Tax is `mulDivRound(subtotal, rateBp, 10 000)`, computed once per document, not per line, so the printed PPN always equals rate × subtotal.

User input is parsed strictly (`1250000` or `1250000.50`). Locale-formatted strings like `1.250.000` are rejected rather than guessed: in Indonesian, `.` is the thousands separator, and guessing wrong would turn a price into a value a thousand times too small.

## Costing

The usual weighted-average implementation stores a rounded average unit cost and multiplies it out on every issue. Each issue then rounds, and over thousands of shipments the stock valuation drifts away from the Inventory account in the general ledger. Someone eventually posts a "rounding adjustment" to make them match.

Kiln stores the **total value** of each product's stock instead:

```text
receive(qty, unitCost):  value += qty × unitCost
issue(qty):              cost = qty == onHand ? value : round(value × qty / onHand)
                         value -= cost
```

Each issue rounds once, and the last unit out removes exactly the remaining value. The cost removed from stock is the cost posted to COGS. So, by construction:

```text
Σ products.inventory_value  ==  balance of GL 1300 Inventory
```

A property test runs 200 random receipt/issue histories, and the integration tests check this equality after every scenario. The dashboard also checks it live.

## Consequences

- The average unit cost shown in the UI is derived (`value / onHand`), never stored.
- A stock-count gain is valued at the current average, or at the last purchase cost when nothing is on hand.
