// Shared with the artifact-tool template builder; deliberately dependency-free.
export const PURCHASE_IMPORT_VERSION = "asha.purchase_import.v1";
export const PURCHASE_IMPORT_SHEET = "خریدها";
export const PURCHASE_IMPORT_COLUMNS = ["id", "assetId", "assetClass", "unit", "purityPermille", "quantity", "purchaseDate", "purchaseTime", "paymentCurrency", "unitPrice", "fees", "note", "sourceReference", "fxTomanPerUsd", "fxRateDate", "fxRateType", "fxSource", "fxReceivedAt", "calendar", "timeZone"] as const;
