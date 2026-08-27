export type AssetCategory = {
  id: string;
  label: string;
  assets: readonly string[];
};

export const assetCategories: readonly AssetCategory[] = [
  {
    id: "precious-metals",
    label: "طلا، سکه و نقره",
    assets: ["طلای ۱۸ عیار", "طلای ۲۴ عیار", "مثقال طلا", "سکه امامی", "سکه بهار آزادی", "نیم سکه", "ربع سکه", "سکه یک گرمی", "شمش نقره ۹۹۹"],
  },
  {
    id: "cash-currency",
    label: "پول، ارز و سپرده",
    assets: ["ارز خارجی", "وجه نقد و سپرده بانکی"],
  },
  {
    id: "capital-market",
    label: "بورس، صندوق و گواهی",
    assets: ["سهام", "صندوق سرمایه‌گذاری و ETF", "گواهی سپرده کالایی"],
  },
  {
    id: "digital-assets",
    label: "رمزارز و دارایی دیجیتال",
    assets: ["رمزارز", "دارایی دیجیتال و مالکیت فکری"],
  },
  {
    id: "physical-assets",
    label: "ملک، خودرو و دارایی فیزیکی",
    assets: ["ملک و زمین", "خودرو و تجهیزات"],
  },
  {
    id: "private-credit",
    label: "کسب‌وکار و مطالبات",
    assets: ["کسب‌وکار خصوصی", "طلب و وام پرداختی"],
  },
];

export const assetOptions = assetCategories.flatMap((category) => category.assets);

export function getAssetOptionsForCategory(categoryId: string) {
  return assetCategories.find((category) => category.id === categoryId)?.assets ?? [];
}

export function getAssetCategoryForAsset(assetName: string) {
  return assetCategories.find((category) => category.assets.includes(assetName))
    ?? { id: "other", label: "سایر دارایی‌ها", assets: [] };
}
