export type HoldingDisplayRow = { id: string; name: string; value: string | null; weight: number | null };
export type HoldingDisplaySort = { key: "name" | "value" | "weight"; direction: "asc" | "desc" };

// Presentation only: do not reorder the canonical portfolio or compare unlike units.
export function orderHoldingRows<T extends HoldingDisplayRow>(rows: readonly T[], sort: HoldingDisplaySort | null): T[] {
  if (!sort) return [...rows];
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    // Unknown values remain explicit and last, even in descending order.
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const comparison = sort.key === "name"
      ? a.name.localeCompare(b.name, "fa")
      : (() => { const x = BigInt(left); const y = BigInt(right); return x < y ? -1 : x > y ? 1 : 0; })();
    return comparison * sign || a.id.localeCompare(b.id);
  });
}
