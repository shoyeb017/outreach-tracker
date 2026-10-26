import * as XLSX from "xlsx";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email";

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_COLUMNS = 500;
export const IMPORT_EXTENSIONS = ["xlsx", "xls", "xlsm", "xlsb", "ods", "fods", "csv", "tsv", "txt"] as const;
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.map(extension => `.${extension}`).join(",");
export const IMPORT_FORMAT_LABEL = "Excel (.xlsx, .xls, .xlsm, .xlsb), OpenDocument (.ods, .fods), CSV, TSV or delimited TXT";
export interface WorkbookInfo { fileName: string; sheetNames: string[] }

export function suggestedSpreadsheetName(fileName: string, sheetName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "Spreadsheet";
  const worksheet = sheetName.trim().slice(0, 80) || "Worksheet";
  return `${base.slice(0, 197 - worksheet.length)} — ${worksheet}`;
}

export interface ParsedSheet {
  fileName: string;
  sheetNames: string[];
  selectedSheet: string;
  columns: { originalLabel: string; slug: string; index: number }[];
  rows: Record<string, unknown>[];
  previewRows: Record<string, unknown>[];
  analysis: { totalRows: number; potentialEmails: number; missingValues: number; duplicateRows: number; invalidEmails: number };
}

export function normalizeColumnSlug(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return slug || "column";
}

export function createUniqueSlugs(labels: string[]): string[] {
  const counts = new Map<string, number>();
  const used = new Set<string>();
  return labels.map((label) => {
    const base = normalizeColumnSlug(label);
    let count = (counts.get(base) ?? 0) + 1;
    let slug = count === 1 ? base : `${base}_${count}`;
    while (used.has(slug)) { count++; slug = `${base}_${count}`; }
    counts.set(base, count);
    used.add(slug);
    return slug;
  });
}

export function validateImportFile(file: Pick<File, "name" | "size">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !IMPORT_EXTENSIONS.some(allowed => allowed === extension)) throw new Error(`Choose ${IMPORT_FORMAT_LABEL}. For other formats, export your sheet as Excel or CSV first.`);
  if (!file.size) throw new Error("This file is empty. Choose a spreadsheet with headers and recipient rows.");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("This file is larger than the 15 MB import limit.");
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(file.name)) throw new Error("The file name contains unsupported characters.");
}

function rowsFromSheet(sheet: XLSX.WorkSheet) {
  if (sheet["!fullref"] && XLSX.utils.decode_range(sheet["!fullref"]).e.r >= MAX_IMPORT_ROWS + 2) throw new Error(`This worksheet has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows in its data range. Remove unused rows or choose another worksheet.`);
  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  if (range && range.e.c - range.s.c + 1 > MAX_IMPORT_COLUMNS) throw new Error(`This worksheet has more than ${MAX_IMPORT_COLUMNS} columns. Remove unused columns or choose another worksheet.`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
}

function readWorkbook(buffer: ArrayBuffer, options: XLSX.ParsingOptions = {}, fileName = "") {
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw new Error("This file is larger than the 15 MB import limit.");
  if (!buffer.byteLength) throw new Error("This file is empty. Choose another spreadsheet.");
  try {
    const textFile = /\.(csv|tsv|txt)$/i.test(fileName);
    let input: ArrayBuffer | string = buffer;
    if (textFile) {
      // Decode with the browser's native codecs: SheetJS's browser build does not
      // include optional codepage tables. Preserve Unicode without adding a large bundle.
      const bytes = new Uint8Array(buffer);
      if (bytes[0] === 0xff && bytes[1] === 0xfe) input = new TextDecoder("utf-16le").decode(bytes);
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) input = new TextDecoder("utf-16be").decode(bytes);
      else {
        try { input = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
        catch { input = new TextDecoder("windows-1252").decode(bytes); }
      }
    }
    const book = XLSX.read(input, { type: textFile ? "string" : "array", raw: true, cellDates: true, sheetRows: MAX_IMPORT_ROWS + 2, cellHTML: false, cellFormula: false, bookVBA: false, ...options });
    if (!book.SheetNames.length) throw new Error("The workbook does not contain any worksheets.");
    return book;
  } catch (error) {
    if (error instanceof Error && /password|encrypt/i.test(error.message)) throw new Error("This spreadsheet is password-protected. Save an unprotected copy before importing.");
    throw new Error("Could not read this spreadsheet. It may be damaged or unsupported. Open it in your spreadsheet app and export as .xlsx or .csv, then try again.");
  }
}

export function inspectWorkbookData(buffer: ArrayBuffer, fileName: string): WorkbookInfo {
  const workbook = readWorkbook(buffer, { bookSheets: true }, fileName);
  return { fileName, sheetNames: workbook.SheetNames };
}

export async function inspectSpreadsheetFile(file: File): Promise<WorkbookInfo> {
  validateImportFile(file);
  return inspectWorkbookData(await file.arrayBuffer(), file.name);
}

export function parseWorkbookData(buffer: ArrayBuffer, fileName: string, requestedSheet?: string): ParsedSheet {
  const workbook = readWorkbook(buffer, requestedSheet ? { sheets: requestedSheet } : {}, fileName);
  if (requestedSheet && !workbook.SheetNames.includes(requestedSheet)) throw new Error("That worksheet is no longer available. Choose a worksheet from the list.");
  const selectedSheet = requestedSheet ?? workbook.SheetNames[0];
  if (!workbook.Sheets[selectedSheet]) throw new Error("Could not read that worksheet. Choose another sheet or export it as CSV.");
  const rows = rowsFromSheet(workbook.Sheets[selectedSheet]);
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`This worksheet has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows.`);
  const labels = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const slugs = createUniqueSlugs(labels);
  const duplicateSignatures = new Set<string>();
  let duplicateRows = 0;
  let missingValues = 0;
  let potentialEmails = 0;
  let invalidEmails = 0;
  for (const row of rows) {
    const signature = JSON.stringify(row);
    if (duplicateSignatures.has(signature)) duplicateRows += 1;
    duplicateSignatures.add(signature);
    missingValues += labels.filter((label) => String(row[label] ?? "").trim() === "").length;
    for (const [label, value] of Object.entries(row)) {
      const text = String(value ?? "").trim();
      if (text && (/email/i.test(label) || text.includes("@"))) {
        potentialEmails += 1;
        if (!isValidEmail(text)) invalidEmails += 1;
      }
    }
  }
  return {
    fileName,
    sheetNames: workbook.SheetNames,
    selectedSheet,
    columns: labels.map((originalLabel, index) => ({ originalLabel, slug: slugs[index], index })),
    rows,
    previewRows: rows.slice(0, 30),
    analysis: { totalRows: rows.length, potentialEmails, missingValues, duplicateRows, invalidEmails },
  };
}

export async function parseSpreadsheetFile(file: File, requestedSheet?: string) {
  validateImportFile(file);
  return parseWorkbookData(await file.arrayBuffer(), file.name, requestedSheet);
}

export function mapImportedRow(
  row: Record<string, unknown>,
  columns: { originalLabel: string; slug: string }[],
  mapping: Record<string, string>,
) {
  const data = Object.fromEntries(columns.map((column) => [column.slug, row[column.originalLabel] ?? ""]));
  const lookup = (standardField: string) => {
    const original = mapping[standardField];
    return original ? row[original] : "";
  };
  const email = normalizeEmail(lookup("recipient_email"));
  return {
    original_data: row,
    data,
    recipient_email: email || null,
    email_normalized: email || null,
    email_valid: isValidEmail(email),
    routing_value: String(lookup("routing_key") ?? "").trim() || null,
    subject_value: String(lookup("subject") ?? "").trim() || null,
  };
}

export function createExampleWorkbook(format: "csv" | "xlsx", bodySource: "template" | "spreadsheet" = "template") {
  const rows = [
    { "Recipient Name": "Avery Chen", "Public Email": "avery@example.com", "Business Name": "Northstar Labs", Industry: "Technology & Software", Subject: "A quick hello", City: "Seattle" },
    { "Recipient Name": "Jordan Patel", "Public Email": "jordan@example.com", "Business Name": "Harbor Works", Industry: "Manufacturing & Industrial", Subject: "", City: "Austin" },
  ];
  const sheet = XLSX.utils.json_to_sheet(bodySource === "spreadsheet" ? rows.map((row, index) => ({ ...row, Subject: "A quick hello to " + row["Business Name"], Message: `Hi ${row["Recipient Name"]},\n\n${index ? "Here is an idea for Harbor Works." : "Here is an idea for Northstar Labs."}\n\nWould you be open to a short call?` })) : rows);
  if (format === "csv") return new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: "text/csv;charset=utf-8" });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Recipients");
  return new Blob([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
