import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js/index-native.js";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { previewPurchaseWorkbook, PURCHASE_IMPORT_COLUMNS, PURCHASE_IMPORT_VERSION } from "../app/purchase-import.ts";

// Independent, fully in-memory adversarial package fixtures. No owner file/network.
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/package/2006/relationships";
const docRel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const received = "2000-01-01T00:00:00.000Z";
function row(values, number) {
  return `<row r="${number}">${values.map((value, i) => `<c r="${String.fromCharCode(65 + i)}${number}" t="inlineStr"><is><t>${String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</t></is></c>`).join("")}</row>`;
}
function fixture() {
  const cells = ["SYNTHETIC:independent", "GOLD_18K_IRR", "gold", "gram", "750", "1.5", "2000-01-01", "", "TOMAN", "100", "5", "Synthetic fixture", "", "", "", "", "", "", "gregorian", "Asia/Tehran"];
  return {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="${rel}"><Relationship Id="r1" Type="${docRel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="${docRel}"><sheets><sheet name="خریدها" sheetId="1" r:id="s1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${rel}"><Relationship Id="s1" Type="${docRel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${ns}"><sheetData>${row([PURCHASE_IMPORT_VERSION], 1)}${row(PURCHASE_IMPORT_COLUMNS, 2)}${row(["Synthetic label row"], 3)}${row(cells, 4)}</sheetData></worksheet>`,
  };
}
async function pack(parts, options = {}) {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, useCompressionStream: true, level: 6, ...options });
  for (const [path, content] of Object.entries(parts)) await writer.add(path, new TextReader(content));
  return writer.close();
}
const read = file => previewPurchaseWorkbook(file, emptyPurchaseBook(), received);

test("independent security baseline imports only literal XML content without requesting external resources", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw Error("Network is prohibited by this security test"); };
  try {
    const result = await read(await pack(fixture()));
    assert.equal(result.canImport, true); assert.equal(result.lots[0].unitPrice, "100");
  } finally { globalThis.fetch = previous; }
});

test("ZIP path confusion, encrypted archives, truncated archives and declared-size forgery fail closed", async () => {
  for (const path of ["../outside.xml", "/absolute.xml", "xl/../outside.xml", "xl/%2e%2e.xml", "xl/WORKBOOK.XML"]) {
    await assert.rejects(read(await pack({ ...fixture(), [path]: "<x/>" })), path);
  }
  await assert.rejects(read(await pack(fixture(), { password: "synthetic-only-test-password" })));
  const bytes = new Uint8Array(await (await pack(fixture(), { level: 0 })).arrayBuffer());
  await assert.rejects(read(new Blob([bytes.slice(0, -22)])));
  const view = new DataView(bytes.buffer);
  let central = -1;
  for (let i = 0; i < bytes.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) { central = i; break; }
  assert.ok(central >= 0);
  view.setUint32(central + 24, 1, true); // Lie about uncompressed bytes, keeping stored content.
  await assert.rejects(read(new Blob([bytes])));
});

test("external relationship traversal, duplicate XML attributes and entities are rejected before preview", async () => {
  for (const target of ["../../../escape.xml", "file:///C:/private.xml", "//example.invalid/private.xml", "worksheets/sheet1.xml#external"]) {
    const parts = fixture();
    parts["xl/_rels/workbook.xml.rels"] = `<Relationships xmlns="${rel}"><Relationship Id="s1" Type="${docRel}/worksheet" Target="${target}"/></Relationships>`;
    await assert.rejects(read(await pack(parts)), target);
  }
  for (const xml of ["<x a='1' a='2'/>", "<x>&unknown;</x>", "<!DOCTYPE x SYSTEM 'file:///private'><x/>", "<?xml version='1.0' encoding='UTF-16'?><x/>"]) {
    await assert.rejects(read(await pack({ ...fixture(), "xl/untrusted.xml": xml })));
  }
});

test("a malformed optional price or fee cannot silently become missing and pass import validation", async () => {
  for (const [cell, replacement] of [
    ["J", '<c r="J4" t="inlineStr"><v>100</v></c>'],
    ["K", '<c r="K4" t="n"><is><t>5</t></is></c>'],
    ["K", '<c r="K4" t="str"><is><t>5</t></is></c>'],
  ]) {
    const parts = fixture();
    parts["xl/worksheets/sheet1.xml"] = parts["xl/worksheets/sheet1.xml"].replace(new RegExp(`<c r="${cell}4"[^>]*>.*?</c>`), replacement);
    await assert.rejects(read(await pack(parts)), `${cell}: mismatched cell type/value must not be dropped`);
  }
});
