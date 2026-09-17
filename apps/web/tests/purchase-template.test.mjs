import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js/index-native.js";
import { DOMParser } from "@xmldom/xmldom";
import { emptyPurchaseBook, purchaseAssetCatalog } from "../app/purchase-book.ts";
import { previewPurchaseWorkbook } from "../app/purchase-import.ts";
import { PURCHASE_IMPORT_COLUMNS, PURCHASE_IMPORT_SHEET } from "../app/purchase-import-schema.ts";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const list = (document, name) => [...document.getElementsByTagNameNS(NS, name)];

test("downloaded artifact template keeps input blank and all catalog choices present without synthetic examples", async () => {
  const file = new Blob([await readFile(new URL("../public/templates/purchase-lots-v1.xlsx", import.meta.url))]);
  const result = await previewPurchaseWorkbook(file, emptyPurchaseBook(), "2000-01-01T00:00:00.000Z");
  assert.equal(result.canImport, false); assert.deepEqual(result.lots, []); assert.deepEqual(result.rows, []);
  assert.match(result.errors[0], /خالی/);
  const archive = new ZipReader(new BlobReader(file), { useWebWorkers: false, strictness: "strict" });
  const documents = new Map();
  try {
    for (const entry of await archive.getEntries()) {
      assert.match(entry.filename, /\.(xml|rels)$/);
      documents.set(entry.filename, new DOMParser().parseFromString(await entry.getData(new TextWriter()), "application/xml"));
    }
  } finally { await archive.close(); }
  const sheets = list(documents.get("xl/workbook.xml"), "sheet");
  assert.deepEqual(sheets.map((sheet) => sheet.getAttribute("name")), ["راهنما", PURCHASE_IMPORT_SHEET, "فهرست‌ها"]);
  const relations = [...documents.get("xl/_rels/workbook.xml.rels").getElementsByTagNameNS(REL, "Relationship")];
  const getSheet = (name) => {
    const id = sheets.find((sheet) => sheet.getAttribute("name") === name).getAttributeNS(DOC_REL, "id");
    const path = relations.find((item) => item.getAttribute("Id") === id).getAttribute("Target");
    return documents.get(path.startsWith("/") ? path.slice(1) : `xl/${path}`);
  };
  const input = getSheet(PURCHASE_IMPORT_SHEET);
  const headers = list(input, "row").find((row) => row.getAttribute("r") === "2");
  assert.deepEqual(list(headers, "c").map((node) => node.textContent), [...PURCHASE_IMPORT_COLUMNS]);
  const validations = list(input, "dataValidation");
  assert.deepEqual(validations.map((node) => node.getAttribute("sqref")), ["B4:B503", "C4:C503", "D4:D503", "I4:I503", "S4:S503", "T4:T503"]);
  assert.ok(validations.every((node) => node.getAttribute("type") === "list"));
  const choices = list(getSheet("فهرست‌ها"), "c").map((node) => node.textContent);
  for (const asset of purchaseAssetCatalog) assert.ok(choices.includes(asset.id), asset.id);
  const inputCell = (reference) => list(input, "c").find((node) => node.getAttribute("r") === reference);
  const styles = documents.get("xl/styles.xml");
  const cellFormats = list(styles, "cellXfs")[0].childNodes;
  const dateStyle = [...cellFormats].filter((node) => node.nodeType === 1)[Number(inputCell("G4").getAttribute("s"))];
  const numberFormat = list(styles, "numFmt").find((node) => node.getAttribute("numFmtId") === dateStyle.getAttribute("numFmtId"));
  assert.equal(numberFormat.getAttribute("formatCode"), "yyyy-mm-dd");
  for (const document of documents.values()) assert.equal(list(document, "f").length, 0);
});
