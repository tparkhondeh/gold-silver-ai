import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js/index-native.js";
import { emptyPurchaseBook, evaluatePurchaseBook } from "../app/purchase-book.ts";
import { confirmPurchaseImport, importDecimal, importPurchaseDate, previewPurchaseWorkbook, PURCHASE_IMPORT_COLUMNS, PURCHASE_IMPORT_LIMITS, PURCHASE_IMPORT_VERSION } from "../app/purchase-import.ts";

// In-memory protocol fixtures only: no workbook artifact or owner data is written.
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const now = "2000-01-01T12:00:00.000Z";
const synthetic = { id: "SYNTHETIC:purchase1", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750, quantity: 2.5, purchaseDate: "1999-12-01", purchaseTime: "12:30", paymentCurrency: "TOMAN", unitPrice: 100, fees: 5, note: "کاملاً ساختگی برای آزمون", sourceReference: "synthetic-invoice", calendar: "gregorian", timeZone: "Asia/Tehran" };
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const col = (i) => String.fromCharCode(65 + i);
function rowXml(row, number) {
  return `<row r="${number}">${row.map((value, i) => value == null || value === "" ? "" : typeof value === "number" ? `<c r="${col(i)}${number}"><v>${value}</v></c>` : `<c r="${col(i)}${number}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`).join("")}</row>`;
}
function sheetXml(lots = [], { version = PURCHASE_IMPORT_VERSION, headers = PURCHASE_IMPORT_COLUMNS } = {}) {
  return `<worksheet xmlns="${NS}"><sheetData>${rowXml([version], 1)}${rowXml(headers, 2)}${rowXml(headers.map(() => "عنوان فارسی"), 3)}${lots.map((lot, i) => rowXml(PURCHASE_IMPORT_COLUMNS.map((key) => lot[key]), i + 4)).join("")}</sheetData><dataValidations><dataValidation type="list" sqref="I4:I503"><formula1>"IRR,TOMAN,USD"</formula1></dataValidation></dataValidations></worksheet>`;
}
function parts(lots = [synthetic]) {
  return {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${NS}" xmlns:r="${DOC_REL}"><workbookPr date1904="0"/><sheets><sheet name="خریدها" sheetId="1" r:id="rId1"/><sheet name="نمونه‌های ساختگی" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${DOC_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${DOC_REL}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheetXml(lots),
    "xl/worksheets/sheet2.xml": sheetXml([{ ...synthetic, id: "SYNTHETIC:DO-NOT-IMPORT", quantity: 999 }]),
  };
}
async function zip(documents, options = {}) {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, useCompressionStream: true, level: 6, ...options });
  for (const [name, value] of Object.entries(documents)) await writer.add(name, new TextReader(value));
  return writer.close();
}
const preview = async (lots = [synthetic], book = emptyPurchaseBook()) => previewPurchaseWorkbook(await zip(parts(lots)), book, now);

test("XLSX preview is local, preserves exact rows, ignores example sheet and changes nothing before confirmation", async () => {
  const initial = emptyPurchaseBook(); const before = structuredClone(initial);
  const originalFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error("No network allowed in local import"); };
  try {
    const result = await preview([synthetic, { ...synthetic, id: "SYNTHETIC:purchase2", quantity: "0.000000000001", unitPrice: "999999999999999999.123456789012", fees: "0" }], initial);
    assert.equal(result.canImport, true); assert.equal(result.rows.length, 2); assert.deepEqual(initial, before);
    assert.equal(result.lots[0].quantity, "2.5"); assert.equal(result.lots[1].unitPrice, "999999999999999999.123456789012");
    assert.deepEqual(result.lots[0].source, { kind: "xlsx", reference: "synthetic-invoice" });
    assert.ok(result.rows[0].warnings.some((message) => message.includes("نرخ تاریخی")));
    assert.throws(() => confirmPurchaseImport(result, initial, false), /تأیید/);
    const saved = confirmPurchaseImport(result, initial, true);
    assert.equal(saved.lots.length, 2); assert.equal(saved.imports.length, 1);
    assert.deepEqual(saved.imports[0].lotIds, result.lots.map((lot) => lot.id)); assert.deepEqual(initial, before);
    assert.throws(() => confirmPurchaseImport(result, saved, true), /تغییر کرده/);
  } finally { globalThis.fetch = originalFetch; }
});

test("same-file replay and stable-ID collisions are blocked atomically, similar purchases are not deleted", async () => {
  const file = await zip(parts()); const first = await previewPurchaseWorkbook(file, emptyPurchaseBook(), now);
  const saved = confirmPurchaseImport(first, emptyPurchaseBook(), true);
  await assert.rejects(previewPurchaseWorkbook(file, saved, now), /قبلاً ثبت/);
  const collision = await preview([synthetic, { ...synthetic, id: "SYNTHETIC:new" }], saved);
  assert.equal(collision.canImport, false); assert.match(collision.rows[0].errors[0], /شناسه/);
  assert.throws(() => confirmPurchaseImport(collision, saved, true), /تأیید/);
  const duplicateIds = await preview([synthetic, synthetic]); assert.equal(duplicateIds.canImport, false);
  const similar = await preview([{ ...synthetic, id: "SYNTHETIC:similar", note: "Separate legitimate purchase" }], saved);
  assert.equal(similar.canImport, true); assert.ok(similar.rows[0].warnings.some((item) => item.includes("مشابه")));
  assert.equal(confirmPurchaseImport(similar, saved, true).lots.length, 2);
});

test("preview identity, content and base-book guards reject stale or forged confirmations", async () => {
  const result = await preview();
  assert.throws(() => confirmPurchaseImport(structuredClone(result), emptyPurchaseBook(), true), /تأیید/);
  const changed = await preview(); changed.lots[0].quantity = "999";
  assert.throws(() => confirmPurchaseImport(changed, emptyPurchaseBook(), true), /تأیید/);
  const other = confirmPurchaseImport(await preview([{ ...synthetic, id: "SYNTHETIC:other" }]), emptyPurchaseBook(), true);
  assert.throws(() => confirmPurchaseImport(result, other, true), /تغییر کرده/);
});

test("invalid rows retain valid preview rows but prevent any partial commit", async () => {
  const cases = [
    { unit: "unit" }, { quantity: "-1" }, { quantity: "1e2" }, { quantity: "0" }, { purityPermille: 999 },
    { purchaseDate: "1999-02-30" }, { purchaseTime: 0.5 }, { paymentCurrency: "EUR" }, { calendar: "jalali" },
    { timeZone: "UTC" }, { fees: "-1" }, { fxTomanPerUsd: 100 },
    { assetId: "EMAMI_COIN_IRR", assetClass: "coin", unit: "unit", purityPermille: null, quantity: 1.5 },
  ];
  for (const [i, invalid] of cases.entries()) {
    const result = await preview([synthetic, { ...synthetic, ...invalid, id: `SYNTHETIC:bad${i}` }]);
    assert.equal(result.canImport, false, JSON.stringify(invalid)); assert.ok(result.rows[1].errors.length);
    assert.equal(result.rows[0].lot.id, synthetic.id); assert.throws(() => confirmPurchaseImport(result, emptyPurchaseBook(), true));
  }
});

test("blank cost and missing FX remain unknown; per-row FX is explicitly unverified and date bound", async () => {
  const fx = { fxTomanPerUsd: 100, fxRateDate: "1999-12-01", fxRateType: "manual sale", fxSource: "synthetic user input", fxReceivedAt: now };
  const result = await preview([{ ...synthetic, ...fx }, { ...synthetic, id: "SYNTHETIC:missing", unitPrice: "", fees: "" }]);
  assert.equal(result.canImport, true); assert.equal(result.lots[0].fx.validity, "user_entered_unverified");
  assert.equal(result.lots[1].unitPrice, null); assert.equal(result.lots[1].fees, null); assert.equal(result.lots[1].fx, null);
  const evaluation = evaluatePurchaseBook(confirmPurchaseImport(result, emptyPurchaseBook(), true));
  assert.deepEqual(evaluation.lots[0].landedUsd, { numerator: "51", denominator: "20" });
  assert.equal(evaluation.assets[0].usd.complete, false); assert.equal(evaluation.assets[0].usd.average, null);
  const wrongDate = await preview([{ ...synthetic, ...fx, fxRateDate: "1999-12-02" }]); assert.equal(wrongDate.canImport, false);
  const recordedNow = await preview([{ ...synthetic, ...fx, fxReceivedAt: "" }]);
  assert.equal(recordedNow.lots[0].fx.receivedAt, now);
  assert.ok(recordedNow.rows[0].warnings.some((message) => message.includes("تأمین‌کننده نیست")));
});

test("1900 serial dates preserve calendar days, reject the nonexistent leap day and nonintegral dates", async () => {
  assert.equal(importPurchaseDate({ value: "1", numeric: true }), "1900-01-01");
  assert.equal(importPurchaseDate({ value: "59", numeric: true }), "1900-02-28");
  assert.equal(importPurchaseDate({ value: "61", numeric: true }), "1900-03-01");
  assert.equal(importPurchaseDate({ value: "2958465", numeric: true }), "9999-12-31");
  for (const value of ["0", "60", "1.5", "2958466"]) assert.throws(() => importPurchaseDate({ value, numeric: true }));
  const result = await preview([{ ...synthetic, purchaseDate: 36526 }]); assert.equal(result.lots[0].purchaseDate, "2000-01-01");
  const documents = parts(); documents["xl/workbook.xml"] = documents["xl/workbook.xml"].replace('date1904="0"', 'date1904="true"');
  await assert.rejects(previewPurchaseWorkbook(await zip(documents), emptyPurchaseBook(), now), /۱۹۰۴/);
});

test("numeric XML exponent expansion is exact and bounded; text exponent is never silently coerced", () => {
  assert.equal(importDecimal({ value: "1.25e-3", numeric: true }), "0.00125");
  assert.equal(importDecimal({ value: "1e+17", numeric: true }), "100000000000000000");
  assert.equal(importDecimal({ value: "0.000000000001", numeric: true }), "0.000000000001");
  for (const value of ["1e999", "1e-13", "1e18", "-1e2", "+1e2", "NaN", "Infinity", "1,000"]) assert.throws(() => importDecimal({ value, numeric: true }));
  assert.throws(() => importDecimal({ value: "1e2", numeric: false }));
});

test("version, headers, empty input and row count are strict; examples never become purchases", async () => {
  const empty = await preview([]); assert.equal(empty.canImport, false); assert.equal(empty.lots.length, 0);
  for (const replacement of [sheetXml([synthetic], { version: "asha.purchase_import.v2" }), sheetXml([synthetic], { headers: [...PURCHASE_IMPORT_COLUMNS].reverse() })]) {
    const documents = parts(); documents["xl/worksheets/sheet1.xml"] = replacement;
    await assert.rejects(previewPurchaseWorkbook(await zip(documents), emptyPurchaseBook(), now), /نسخه/);
  }
  await assert.rejects(preview(Array.from({ length: 501 }, (_, i) => ({ ...synthetic, id: `SYNTHETIC:${i}` }))), /۵۰۰/);
  const initial = confirmPurchaseImport(await preview(Array.from({ length: 500 }, (_, i) => ({ ...synthetic, id: `SYNTHETIC:${i}` }))), emptyPurchaseBook(), true);
  const full = await preview([{ ...synthetic, id: "SYNTHETIC:overflow" }], initial); assert.equal(full.canImport, false); assert.match(full.errors[0], /ظرفیت/);
});

test("shared strings and rich inline text are read without number coercion", async () => {
  const documents = parts(); documents["xl/sharedStrings.xml"] = `<sst xmlns="${NS}"><si><t>999999999999999999.123456789012</t></si></sst>`;
  documents["xl/worksheets/sheet1.xml"] = documents["xl/worksheets/sheet1.xml"].replace('<c r="J4"><v>100</v></c>', '<c r="J4" t="s"><v>0</v></c>');
  const result = await previewPurchaseWorkbook(await zip(documents), emptyPurchaseBook(), now);
  assert.equal(result.lots[0].unitPrice, "999999999999999999.123456789012");
});

test("formulas anywhere, external links, macros, entities and malformed XML fail closed", async () => {
  const modifications = [
    (docs) => { docs["xl/worksheets/sheet2.xml"] = docs["xl/worksheets/sheet2.xml"].replace('<c r="F4">', '<c r="F4"><f>1+1</f>'); },
    (docs) => { docs["xl/_rels/workbook.xml.rels"] = `<Relationships xmlns="${REL}"><Relationship Id="external" TargetMode="External" Target="https://invalid.example/secret"/></Relationships>`; },
    (docs) => { docs["xl/_rels/workbook.xml.rels"] = `<Relationships xmlns="${REL}"><Relationship Id="external" Target="https://invalid.example/secret"/></Relationships>`; },
    (docs) => { docs["xl/vbaProject.bin"] = "malicious"; },
    (docs) => { docs["xl/evil.xml"] = '<!DOCTYPE x [<!ENTITY a "boom">]><x>&a;</x>'; },
    (docs) => { docs["xl/evil.xml"] = '<x><y></x>'; },
    (docs) => { docs["xl/evil.xml"] = '<?external href="https://invalid.example"?><x/>'; },
    (docs) => { docs["xl/evil.xml"] = '<x>'.repeat(65) + '</x>'.repeat(65); },
    (docs) => { docs["[Content_Types].xml"] = docs["[Content_Types].xml"].replace('sheet.main+xml', 'macroEnabled.main+xml'); },
    (docs) => { docs["xl/workbook.xml"] = docs["xl/workbook.xml"].replace('</workbook>', '<definedNames><definedName name="hidden">\'[external.xlsx]Sheet1\'!$A$1</definedName></definedNames></workbook>'); },
    (docs) => { docs["xl/worksheets/sheet1.xml"] = docs["xl/worksheets/sheet1.xml"].replace('"IRR,TOMAN,USD"', 'WEBSERVICE("https://invalid.example")'); },
  ];
  for (const mutate of modifications) { const docs = parts(); mutate(docs); await assert.rejects(previewPurchaseWorkbook(await zip(docs), emptyPurchaseBook(), now)); }
});

test("internal dropdown ranges are allowed but duplicated relationship IDs and sheets are rejected", async () => {
  const docs = parts(); docs["xl/worksheets/sheet1.xml"] = docs["xl/worksheets/sheet1.xml"].replace('"IRR,TOMAN,USD"', "'نمونه‌های ساختگی'!$A$1:$A$3");
  assert.equal((await previewPurchaseWorkbook(await zip(docs), emptyPurchaseBook(), now)).canImport, true);
  for (const [path, from, to] of [
    ["xl/_rels/workbook.xml.rels", 'Id="rId2"', 'Id="rId1"'],
    ["xl/workbook.xml", 'name="نمونه‌های ساختگی"', 'name="خریدها"'],
    ["xl/workbook.xml", 'r:id="rId2"', 'r:id="rId1"'],
    ["xl/worksheets/sheet1.xml", '<row r="4">', '<row r="4"/><row r="4">'],
  ]) {
    const invalid = parts(); invalid[path] = invalid[path].replace(from, to);
    await assert.rejects(previewPurchaseWorkbook(await zip(invalid), emptyPurchaseBook(), now));
  }
});

test("ambiguous, hidden and unsupported cells cannot silently change imported rows", async () => {
  for (const [from, to] of [
    ['<row r="4">', '<row r="4" hidden="1">'], ['r="F4"', 'r="F5"'], ['r="F4"', 'r="E4"'],
    ['<c r="F4">', '<c r="F4" t="e">'], ['<c r="F4">', '<c r="F4" t="b">'],
    ['<c r="F4">', '<c r="F4" t="s">'], ['<c r="F4"><v>2.5</v>', '<c r="F4"><v>2.5</v><v>5</v>'],
    ['<c r="F4"><v>2.5</v>', '<c r="F4"><v>2.5</v><is><t>5</t></is>'],
    ['r="T4"', 'r="U4"'],
  ]) {
    const docs = parts(); docs["xl/worksheets/sheet1.xml"] = docs["xl/worksheets/sheet1.xml"].replace(from, to);
    await assert.rejects(previewPurchaseWorkbook(await zip(docs), emptyPurchaseBook(), now), `${from} => ${to}`);
  }
});

test("corrupt archive and resource limits fail before portfolio mutation", async () => {
  for (const blob of [new Blob(), new Blob(["not a zip"]), new Blob([new Uint8Array(PURCHASE_IMPORT_LIMITS.compressedBytes + 1)])]) await assert.rejects(previewPurchaseWorkbook(blob, emptyPurchaseBook(), now));
  const docs = parts(); docs["xl/bomb.xml"] = `<x>${" ".repeat(PURCHASE_IMPORT_LIMITS.entryBytes)}</x>`;
  await assert.rejects(previewPurchaseWorkbook(await zip(docs), emptyPurchaseBook(), now), /اندازه/);
  const excessive = parts(); for (let i = 0; i < 129; i++) excessive[`xl/part${i}.xml`] = "<x/>";
  await assert.rejects(previewPurchaseWorkbook(await zip(excessive), emptyPurchaseBook(), now), /تعداد/);
  const bytes = new Uint8Array(await (await zip(parts(), { level: 0 })).arrayBuffer());
  const index = new TextDecoder().decode(bytes).indexOf("SYNTHETIC:purchase1"); bytes[index] = 88;
  await assert.rejects(previewPurchaseWorkbook(new Blob([bytes]), emptyPurchaseBook(), now));
});
