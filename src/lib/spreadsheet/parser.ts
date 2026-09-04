import * as XLSX from "xlsx";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email";

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;

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
  return labels.map((label) => {
    const base = normalizeColumnSlug(label);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

export function validateImportFile(file: Pick<File, "name" | "size">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xls", "csv"].includes(extension)) throw new Error("Choose an .xlsx, .xls, or .csv file.");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("This file is larger than the 15 MB import limit.");
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(file.name)) throw new Error("The file name contains unsupported characters.");
}

function rowsFromSheet(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
}

export function parseWorkbookData(buffer: ArrayBuffer, fileName: string, requestedSheet?: string): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  if (!workbook.SheetNames.length) throw new Error("The workbook does not contain any worksheets.");
  const selectedSheet = requestedSheet && workbook.SheetNames.includes(requestedSheet) ? requestedSheet : workbook.SheetNames[0];
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

export function createExampleWorkbook(format: "csv" | "xlsx") {
  const rows = [
    { "Recipient Name": "Avery Chen", "Recipient Email": "avery@example.com", "Company Name": "Northstar Labs", Category: "Customer", Subject: "A quick hello", City: "Seattle" },
    { "Recipient Name": "Jordan Patel", "Recipient Email": "jordan@example.com", "Company Name": "Harbor Works", Category: "Supplier", Subject: "", City: "Austin" },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (format === "csv") return new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: "text/csv;charset=utf-8" });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Recipients");
  return new Blob([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
