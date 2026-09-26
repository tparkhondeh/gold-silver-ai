import { comparePersonalRatios, type PersonalMarketRow } from "./personal-market-valuation.ts";

export const PERSONAL_ASSET_SORT_FIELDS = [
  ["original", "ترتیب اولیه"], ["name", "نام دارایی"],
  ["cost", "بهای کل خرید با هزینه"], ["value", "ارزش جاری"], ["profit", "سود / زیان"],
] as const;
export type PersonalAssetSortField = typeof PERSONAL_ASSET_SORT_FIELDS[number][0];
export type PersonalAssetSortDirection = "asc" | "desc";
type SortableAsset = Pick<PersonalMarketRow, "name" | "landedBasisRial" | "currentValueRial" | "profitLossRial">;

/** Display order only. Never mutate the valuation, purchase book or persisted IDs.
 * All monetary fields use whole-asset Rial ratios (same order as displayed Toman),
 * not covered subtotals, averages, quantities or mixed payment currencies. */
export function orderPersonalAssetRows<T extends SortableAsset>(
  rows: readonly T[], field: PersonalAssetSortField, direction: PersonalAssetSortDirection,
): T[] {
  if (field === "original") return [...rows];
  const value = (row: T) => field === "cost" ? row.landedBasisRial.complete ? row.landedBasisRial.total : null
    : field === "value" ? row.currentValueRial : row.profitLossRial;
  return rows.map((row, index) => ({ row, index })).sort((left, right) => {
    let compared: number;
    if (field === "name") compared = left.row.name.localeCompare(right.row.name, "fa");
    else {
      const a = value(left.row), b = value(right.row);
      // Missing stays last in both directions; equal/missing peers retain the
      // input order rather than reversing ties when direction changes.
      if (a === null || b === null) return a === null ? b === null ? left.index - right.index : 1 : -1;
      compared = comparePersonalRatios(a, b);
    }
    return compared === 0 ? left.index - right.index : direction === "asc" ? compared : -compared;
  }).map(({ row }) => row);
}
