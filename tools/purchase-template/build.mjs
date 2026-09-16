// Run with bundled artifact-tool via a local node_modules junction; no repo XLSX authoring dependency.
import fs from "node:fs/promises";
import { resolve } from "node:path";
import { Workbook, SpreadsheetFile, FileBlob } from "@oai/artifact-tool";
import { purchaseAssetCatalog } from "../../apps/web/app/purchase-book.ts";
import { PURCHASE_IMPORT_COLUMNS, PURCHASE_IMPORT_VERSION } from "../../apps/web/app/purchase-import-schema.ts";

if (process.argv[2] === "--help") {
  console.log("build.mjs [output-directory] OR --fill-test downloaded-template.xlsx output-directory");
  process.exit(0);
}
if (process.argv[2] === "--fill-test") {
  const source = resolve(process.argv[3]); const destination = resolve(process.argv[4]);
  const testBook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
  const target = testBook.worksheets.getItem("خریدها");
  const sample = testBook.worksheets.getItem("نمونه ساختگی");
  target.getRange("A4:T5").copyFrom(sample.getRange("A4:T5"), "values");
  testBook.recalculate();
  await fs.mkdir(destination, { recursive: true });
  console.log((await testBook.inspect({kind:"table",range:"خریدها!F4:K5",include:"values,formulas",maxChars:1200})).ndjson);
  await fs.writeFile(resolve(destination, "filled-input.png"), new Uint8Array(await (await testBook.render({sheetName:"خریدها",range:"A1:J6",scale:1.5,format:"png"})).arrayBuffer()));
  await (await SpreadsheetFile.exportXlsx(testBook)).save(resolve(destination, "synthetic-upload.xlsx"));
  process.exit(0);
}
if (process.argv[2]?.startsWith("--")) throw new Error("Unknown option");
const output = resolve(process.argv[2] ?? "outputs/purchase-lots-20260916");
await fs.mkdir(output, { recursive: true });
const workbook = Workbook.create();
const guide = workbook.worksheets.add("راهنما");
const input = workbook.worksheets.add("خریدها");
const lists = workbook.worksheets.add("فهرست‌ها");
const examples = workbook.worksheets.add("نمونه ساختگی");
const headers = ["شناسه خرید *", "کد دارایی *", "کلاس دارایی *", "واحد مقدار *", "عیار در هزار", "مقدار خرید *", "تاریخ خرید میلادی *", "ساعت تهران", "ارز پرداخت *", "قیمت هر واحد", "جمع هزینه جانبی", "یادداشت", "منشأ خرید", "تومان برای یک دلار", "تاریخ نرخ میلادی", "نوع نرخ", "منشأ نرخ", "زمان ثبت نرخ UTC", "تقویم *", "منطقه زمانی *"];
for (const sheet of [guide, input, lists, examples]) {
  sheet.showGridLines = false;
  sheet.getRange("A1:T30").format.font = { name: "Arial", size: 11, color: "#263343" };
  sheet.getRange("A1:T30").format.verticalAlignment = "center";
}
guide.tabColor = "#27394E";
guide.getRange("A2").values = [["راهنمای ورود خریدها به اشا"]];
guide.getRange("A2").format.font = { name: "Arial", size: 16, bold: true };
guide.getRange("A4:B18").values = [
  ["نسخه قالب", PURCHASE_IMPORT_VERSION],
  ["روش استفاده", "فقط برگه «خریدها» را پر کنید؛ هر ردیف یک خرید. سپس در برنامه، پیش‌نمایش را بررسی و تأیید کنید."],
  ["ستون‌های الزامی", "عنوان دارای * الزامی است. شناسه هر خرید متفاوت باشد؛ مانند buy-001 و buy-002."],
  ["انتخاب دارایی", "کد، کلاس، واحد و عیار را از یک ردیف «فهرست‌ها» بردارید. عنوان کلی سهام یا صندوق هویت یک ابزار نیست."],
  ["مقدار و قیمت", "قیمت برای یک واحدِ ستون واحد است. سکه تعداد صحیح دارد؛ طلا و نقره مقدار گرمی دارند."],
  ["ارز و هزینه", "IRR = ریال، TOMAN = تومان، USD = دلار. هزینه‌ها جمع کل جانبی همین خرید و با همان ارز پرداخت‌اند."],
  ["نامعلوم یا صفر", "قیمت یا هزینه نامعلوم را خالی بگذارید. اگر قطعاً هزینه‌ای نیست، 0 وارد کنید. خالی به صفر تبدیل نمی‌شود."],
  ["تاریخ و ساعت", "تاریخ میلادی با نمایش yyyy-mm-dd یا متن YYYY-MM-DD؛ ساعت اختیاری HH:mm به وقت تهران. تقویم شمسی در این قالب پذیرفته نیست."],
  ["نرخ تاریخی دلار", "اختیاری است. اگر نرخ دارید، ستون‌های نرخ، تاریخ همان روز خرید، نوع و منشأ نرخ را کامل کنید. نرخ امروز جایگزین نشود."],
  ["زمان ثبت نرخ", "اختیاری، مانند 2026-09-16T10:00:00.000Z. خالی باشد، زمان ورود فایل ثبت می‌شود؛ زمان دریافت از فروشنده ادعا نمی‌شود."],
  ["اعتبار نرخ دستی", "همه نرخ‌های این فایل «واردشده توسط کاربر و تأییدنشدهٔ منبع» هستند. هیچ نرخ مفقودی تخمین زده نمی‌شود."],
  ["تقویم و منطقه زمانی", "برای هر خرید، ستون تقویم gregorian و منطقه زمانی Asia/Tehran باشد. اطلاعات نمونه خودکار وارد نمی‌شوند."],
  ["دقت اعداد", "اکسل معمولاً ۱۵ رقم معنادار نگه می‌دارد. برای مقدار دقیق طولانی‌تر، قالب سلول را Text کنید و سپس عدد را دوباره وارد کنید."],
  ["محدوده و امنیت", "حداکثر ۵۰۰ خرید و فایل ۲ مگابایت. فرمول سلولی، ماکرو، رمزگذاری و پیوند خارجی پذیرفته نیست. فایل در مرورگر خوانده می‌شود."],
  ["حفظ سبد قبلی", "خریدهای فایل به سبد اضافه می‌شوند. موجودی قبلی را دوباره ننویسید. همان فایل و شناسه‌های قبلی دوباره ثبت نمی‌شوند."],
];
guide.getRange("A4:A18").format.font = { bold: true };
guide.getRange("A4:A18").format.columnWidth = 25;
guide.getRange("B4:B18").format.columnWidth = 96;
guide.getRange("A4:B18").format.wrapText = true;
guide.getRange("A4:B18").format.rowHeight = 45;
guide.getRange("A2:B2").format.borders = { bottom: { style: "thin", color: "#B6A17B" } };

const listHeaders = ["کد دارایی", "نام فارسی", "کلاس", "واحد", "عیار در هزار", "ارز پرداخت", "تقویم", "منطقه زمانی"];
lists.getRange("A2:H2").values = [listHeaders];
const listRows = purchaseAssetCatalog.map((asset, i) => [asset.id, asset.name, asset.assetClass, asset.unit, asset.purityPermille, ["IRR", "TOMAN", "USD"][i] ?? null, i === 0 ? "gregorian" : null, i === 0 ? "Asia/Tehran" : null]);
lists.getRange(`A3:H${listRows.length + 2}`).values = listRows;
lists.getRange("A2:H2").format = { fill: "#27394E", font: { color: "#FFFFFF", bold: true }, rowHeight: 30 };
lists.getRange("A2:A16").format.columnWidth = 25; lists.getRange("B2:B16").format.columnWidth = 28;
lists.getRange("C2:H16").format.columnWidth = 20; lists.getRange("A3:H16").format.rowHeight = 26;
lists.freezePanes.freezeRows(2);

for (const sheet of [input, examples]) {
  sheet.getRange("A1").values = [[PURCHASE_IMPORT_VERSION]];
  sheet.getRange("A2:T2").values = [[...PURCHASE_IMPORT_COLUMNS]];
  sheet.getRange("A3:T3").values = [headers];
  sheet.getRange("A2:T2").format = { font: { name: "Arial", size: 10, color: "#536170" }, rowHeight: 20 };
  sheet.getRange("A3:T3").format = { fill: "#27394E", font: { name: "Arial", size: 11, color: "#FFFFFF", bold: true }, wrapText: true, horizontalAlignment: "center", rowHeight: 44 };
  sheet.getRange("A4:T503").format.font = { name: "Arial", size: 11, color: "#2457B2" };
  sheet.getRange("A4:T503").format.rowHeight = 26;
  sheet.getRange("A1:T30").format.columnWidth = 22;
  sheet.getRange("B1:B30").format.columnWidth = 25;
  sheet.getRange("R1:R30").format.columnWidth = 30;
  for (const column of ["E", "F", "J", "K", "N"]) sheet.getRange(`${column}4:${column}503`).setNumberFormat("#,##0.############");
  for (const column of ["G", "O"]) sheet.getRange(`${column}4:${column}503`).setNumberFormat("yyyy-mm-dd");
  for (const column of ["A", "B", "C", "D", "H", "I", "L", "M", "P", "Q", "R", "S", "T"]) sheet.getRange(`${column}4:${column}503`).setNumberFormat("@");
  sheet.freezePanes.freezeRows(3); sheet.freezePanes.freezeColumns(2);
  sheet.getRange("B4:B503").dataValidation = { rule: { type: "list", formula1: `'فهرست‌ها'!$A$3:$A$${listRows.length + 2}` } };
  sheet.getRange("C4:C503").dataValidation = { rule: { type: "list", values: [...new Set(purchaseAssetCatalog.map(asset => asset.assetClass))] } };
  sheet.getRange("D4:D503").dataValidation = { rule: { type: "list", values: [...new Set(purchaseAssetCatalog.map(asset => asset.unit))] } };
  sheet.getRange("I4:I503").dataValidation = { rule: { type: "list", values: ["IRR", "TOMAN", "USD"] } };
  sheet.getRange("S4:S503").dataValidation = { rule: { type: "list", values: ["gregorian"] } };
  sheet.getRange("T4:T503").dataValidation = { rule: { type: "list", values: ["Asia/Tehran"] } };
}
const syntheticRows = [
  ["synthetic-buy-001", "GOLD_18K_IRR", "gold", "gram", 750, 2.5, new Date("2026-01-10T00:00:00Z"), null, "TOMAN", 10000000, 100000, "کاملاً ساختگی؛ برای آموزش", "synthetic fixture", 100000, new Date("2026-01-10T00:00:00Z"), "ساختگی", "نمونه آموزشی", null, "gregorian", "Asia/Tehran"],
  ["synthetic-buy-002", "GOLD_18K_IRR", "gold", "gram", 750, 1.5, new Date("2026-02-10T00:00:00Z"), null, "TOMAN", 12000000, 0, "کاملاً ساختگی؛ برای آموزش", "synthetic fixture", 120000, new Date("2026-02-10T00:00:00Z"), "ساختگی", "نمونه آموزشی", null, "gregorian", "Asia/Tehran"],
];
examples.getRange("A4:T5").values = syntheticRows;
examples.getRange("A7").values = [["این برگه خوانده نمی‌شود؛ نمونه‌ها فقط با انتقال آگاهانه به برگه خریدها وارد پیش‌نمایش می‌شوند."]];
examples.getRange("A7").format.font = { bold: true, color: "#9A5500" };
workbook.recalculate();
console.log((await workbook.inspect({ kind: "table", range: "خریدها!A1:F5", include: "values,formulas", tableMaxRows: 5, tableMaxCols: 6, maxChars: 1600 })).ndjson);
console.log((await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!", options: { useRegex: true, maxResults: 20 }, maxChars: 1000 })).ndjson);
for (const [sheetName, range, name] of [["راهنما", "A1:B18", "guide"], ["فهرست‌ها", "A1:H14", "lists"], ["خریدها", "A1:J7", "input"], ["نمونه ساختگی", "A1:J6", "examples"], ["نمونه ساختگی", "K2:T6", "examples-fx"]]) {
  const image = await workbook.render({ sheetName, range, scale: 1.5, format: "png" });
  await fs.writeFile(resolve(output, `${name}.png`), new Uint8Array(await image.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(workbook)).save(resolve(output, "purchase-lots-v1.xlsx"));
console.log("Template exported with four sheets and no input rows or formulas.");
