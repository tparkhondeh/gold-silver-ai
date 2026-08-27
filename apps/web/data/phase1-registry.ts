import {
  DATA_CONTRACT_VERSION,
  type ContractRegistry,
  type InstrumentContract,
  type SourceContract,
} from "./contracts.ts";

export const PHASE1_MANUAL_SOURCE_ID = "owner-local-csv";

const activeFrom = "2026-08-25T00:00:00.000Z";

export const phase1Instruments: readonly InstrumentContract[] = [
  { schemaVersion: DATA_CONTRACT_VERSION, code: "GOLD_18K_IRR", displayName: "طلای ۱۸ عیار", assetClass: "gold", canonicalCurrency: "IRR", canonicalUnit: "gram", activeFrom, retiredAt: null },
  { schemaVersion: DATA_CONTRACT_VERSION, code: "MESGHAL_IRR", displayName: "مثقال طلا", assetClass: "gold", canonicalCurrency: "IRR", canonicalUnit: "mesghal", activeFrom, retiredAt: null },
  { schemaVersion: DATA_CONTRACT_VERSION, code: "EMAMI_COIN_IRR", displayName: "سکه امامی", assetClass: "gold", canonicalCurrency: "IRR", canonicalUnit: "unit", activeFrom, retiredAt: null },
  { schemaVersion: DATA_CONTRACT_VERSION, code: "SILVER_999_IRR", displayName: "نقره ۹۹۹", assetClass: "silver", canonicalCurrency: "IRR", canonicalUnit: "gram", activeFrom, retiredAt: null },
  { schemaVersion: DATA_CONTRACT_VERSION, code: "USD_IRR", displayName: "دلار آزاد", assetClass: "currency", canonicalCurrency: "IRR", canonicalUnit: "usd", activeFrom, retiredAt: null },
  { schemaVersion: DATA_CONTRACT_VERSION, code: "XAU_USD", displayName: "اونس جهانی طلا", assetClass: "reference", canonicalCurrency: "USD", canonicalUnit: "troy_ounce", activeFrom, retiredAt: null },
];

export const phase1Sources: readonly SourceContract[] = [
  {
    schemaVersion: DATA_CONTRACT_VERSION,
    id: PHASE1_MANUAL_SOURCE_ID,
    displayName: "ورود CSV مالک در محیط محلی",
    quality: "manual_snapshot",
    accessMode: "manual_csv",
    active: true,
  },
];

export const phase1ContractRegistry: ContractRegistry = {
  instruments: new Map(phase1Instruments.map((instrument) => [instrument.code, instrument])),
  sources: new Map(phase1Sources.map((source) => [source.id, source])),
};
