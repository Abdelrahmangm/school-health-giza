// Minimal, dependency-light readers for .xlsx and .csv files. They only extract
// cell text; formulas, macros, links and embedded objects are never evaluated.
import { unzipSync } from "fflate";

export type Sheet = { name: string; rows: string[][] };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
const MAX_ROWS = 20000;
const MAX_COLUMNS = 400;

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : entities[e.toLowerCase()],
  );
}
function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? decode(m[1]) : undefined;
}
function textOf(xml: string) {
  // Concatenate every <t> run, ignoring phonetic (<rPh>) helper text.
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += decode(m[1] ?? "");
  return out;
}
function columnIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(bytes: Uint8Array): Sheet[] {
  if (bytes.length > MAX_FILE_BYTES) throw new Error("الملف أكبر من 10 ميجا. قسّمه أو احذف الشيتات اللي مش محتاجها.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("الملف ده مش Excel بصيغة xlsx. احفظه من Excel أو Google Sheets بصيغة ‎.xlsx أو CSV.");
  let total = 0;
  const files = unzipSync(bytes, {
    filter(file) {
      total += file.originalSize;
      if (total > MAX_UNCOMPRESSED_BYTES) throw new Error("محتوى الملف كبير بشكل غير طبيعي؛ اتوقف الفتح للأمان.");
      return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(file.name);
    },
  });
  const read = (name: string) => (files[name] ? new TextDecoder().decode(files[name]) : "");
  const workbook = read("xl/workbook.xml");
  if (!workbook) throw new Error("مش لاقي بيانات الشيتات جوه الملف.");
  const rels = new Map<string, string>();
  for (const m of read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const shared: string[] = [];
  for (const m of read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = attr(m[0], "name") ?? "Sheet";
    const rid = attr(m[0], "r:id");
    const target = rid ? rels.get(rid) : undefined;
    const xml = target ? read("xl/" + target) : "";
    const rows: string[][] = [];
    for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const r = Number(attr(row[1], "r") ?? rows.length + 1) - 1;
      if (r >= MAX_ROWS) throw new Error(`الشيت «${name}» فيه أكتر من ${MAX_ROWS} صف.`);
      const cells: string[] = [];
      for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], "r");
        const index = ref ? columnIndex(ref) : cells.length;
        if (index >= MAX_COLUMNS) continue;
        const type = attr(c[1], "t");
        const body = c[2] ?? "";
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = "";
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = textOf(body);
        else if (v !== undefined) value = decode(v);
        cells[index] = value;
      }
      rows[r] = Array.from(cells, (x) => x ?? "");
    }
    sheets.push({ name, rows: Array.from(rows, (x) => x ?? []) });
  }
  return sheets;
}

/** RFC 4180 CSV with BOM stripping and automatic , ; or tab delimiter detection. */
export function readCsv(source: string, name = "CSV"): Sheet[] {
  const text = source.replace(/^﻿/, "");
  if (text.length > MAX_FILE_BYTES) throw new Error("الملف أكبر من 10 ميجا.");
  const newline = text.search(/\r?\n/);
  const firstLine = newline < 0 ? text : text.slice(0, newline);
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length > MAX_ROWS) throw new Error(`الملف فيه أكتر من ${MAX_ROWS} صف.`);
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return [{ name, rows }];
}

/** SHA-256 hex digest, used to detect re-uploads of the same file. */
export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
