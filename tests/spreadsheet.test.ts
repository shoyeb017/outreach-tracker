import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createUniqueSlugs, IMPORT_ACCEPT, inspectWorkbookData, mapImportedRow, MAX_IMPORT_BYTES, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS, normalizeColumnSlug, parseWorkbookData, suggestedSpreadsheetName, validateImportFile } from "@/lib/spreadsheet/parser";

describe("spreadsheet parsing and mapping", () => {
  it.each(["xlsx", "xls", "xlsm", "xlsb", "ods", "fods"] as const)("reads %s workbooks and keeps worksheet values separate", (bookType) => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Summary");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Company: "Northstar", Email: "a@example.com" }]), "Customers");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Organization: "Harbor", Address: "b@example.com" }]), "Partners");
    const bytes = XLSX.write(book, { type: "array", bookType }) as ArrayBuffer;
    const info = inspectWorkbookData(bytes, `contacts.${bookType}`);
    expect(info.sheetNames).toEqual(["Summary", "Customers", "Partners"]);
    const chosen = parseWorkbookData(bytes, `contacts.${bookType}`, "Partners");
    expect(chosen.selectedSheet).toBe("Partners");
    expect(chosen.rows).toEqual([{ Organization: "Harbor", Address: "b@example.com" }]);
    expect(chosen.columns.map(column => column.originalLabel)).toEqual(["Organization", "Address"]);
    expect(() => parseWorkbookData(bytes, "contacts.xlsx", "Missing")).toThrow(/no longer available/);
  });
  it.each([["csv", "Company,Email\nNorthstar,a@example.com\n"], ["tsv", "Company\tEmail\nNorthstar\ta@example.com\n"], ["txt", "Company\tEmail\nNorthstar\ta@example.com\n"]])("reads %s delimited tables", (extension, text) => {
    const bytes = new TextEncoder().encode(text).buffer;
    const result = parseWorkbookData(bytes, `contacts.${extension}`);
    expect(result.rows).toEqual([{ Company: "Northstar", Email: "a@example.com" }]);
    expect(inspectWorkbookData(bytes, `contacts.${extension}`).sheetNames).toHaveLength(1);
  });
  it("validates advertised formats, file sizes and empty files without pretending to accept PDFs", () => {
    for (const extension of ["xlsx", "xls", "xlsm", "xlsb", "ods", "fods", "csv", "tsv", "txt"]) {
      expect(IMPORT_ACCEPT).toContain("." + extension);
      expect(() => validateImportFile({ name: "contacts." + extension.toUpperCase(), size: 100 })).not.toThrow();
    }
    expect(() => validateImportFile({ name: "contacts.pdf", size: 100 })).toThrow(/export/);
    expect(() => validateImportFile({ name: "contacts.csv", size: 0 })).toThrow(/empty/);
    expect(() => validateImportFile({ name: "contacts.csv", size: MAX_IMPORT_BYTES + 1 })).toThrow(/15 MB/);
  });
  it("suggests an editable combined file and worksheet name", () => {
    expect(suggestedSpreadsheetName("Virginia.contacts.XLSB", "Accounting firms")).toBe("Virginia.contacts — Accounting firms");
    const longName = suggestedSpreadsheetName("A".repeat(240) + ".xlsx", "Accounting firms");
    expect(longName.length).toBeLessThanOrEqual(200);
    expect(longName).toMatch(/ — Accounting firms$/);
  });
  it("preserves quoted CSV values, Unicode and leading zeros instead of guessing numeric values", () => {
    const bytes = new TextEncoder().encode('Company,Email,Code\n"München, ঢাকা",a@example.com,00123\n').buffer;
    expect(parseWorkbookData(bytes, "contacts.csv").rows[0]).toEqual({ Company: "München, ঢাকা", Email: "a@example.com", Code: "00123" });
  });
  it.each(["utf16", "windows1252"])("reads common %s text exports without optional codepage tables", encoding => {
    const text = "Company,Email\nMünchen,a@example.com\n";
    const bytes = encoding === "utf16" ? new Uint8Array([0xff, 0xfe, ...Array.from(text).flatMap(char => [char.charCodeAt(0) & 255, char.charCodeAt(0) >> 8])]).buffer : new Uint8Array(Array.from(text).map(char => char.charCodeAt(0))).buffer;
    expect(parseWorkbookData(bytes, "contacts.csv").rows[0]).toEqual({ Company: "München", Email: "a@example.com" });
  });
  it("does not silently truncate oversized selected sheets or reject a different small sheet", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Email"], ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ["a@example.com"])]), "Too many");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Email: "small@example.com" }]), "Small");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(inspectWorkbookData(bytes, "book.xlsx").sheetNames).toHaveLength(2);
    expect(() => parseWorkbookData(bytes, "book.xlsx", "Too many")).toThrow(/more than/);
    expect(parseWorkbookData(bytes, "book.xlsx", "Small").rows).toHaveLength(1);
  });
  it("bounds very wide worksheet ranges before converting them to rows", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([Array.from({ length: MAX_IMPORT_COLUMNS + 1 }, (_, i) => "Field" + i), ["value"]]), "Wide");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(() => parseWorkbookData(bytes, "book.xlsx", "Wide")).toThrow(/columns/);
  });

  it("normalizes custom headers and prevents slug collisions", () => {
    expect(normalizeColumnSlug(" Annual Révenue ")).toBe("annual_revenue");
    expect(createUniqueSlugs(["Company Name", "company-name", "", ""])).toEqual(["company_name", "company_name_2", "column", "column_2"]);
    expect(new Set(createUniqueSlugs(["Company", "Company", "Company_2"])).size).toBe(3);
  });

  it("parses XLSX rows and reports quality signals", () => {
    const sheet = XLSX.utils.json_to_sheet([
      { Organization: "Northstar Labs", EmailAddress: "person@example.com", Sector: "Customer" },
      { Organization: "Harbor Works", EmailAddress: "not-an-email", Sector: "Supplier" },
    ]);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Recipients");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const result = parseWorkbookData(bytes, "recipients.xlsx");
    expect(result.selectedSheet).toBe("Recipients");
    expect(result.rows).toHaveLength(2);
    expect(result.columns.map((column) => column.slug)).toEqual(["organization", "emailaddress", "sector"]);
    expect(result.analysis.invalidEmails).toBe(1);
  });

  it("maps standard fields while preserving every custom field", () => {
    const row = { Organization: "Northstar Labs", EmailAddress: " PERSON@EXAMPLE.COM ", Sector: "VIP", "Annual Revenue": "100" };
    const columns = Object.keys(row).map((originalLabel) => ({ originalLabel, slug: normalizeColumnSlug(originalLabel) }));
    const mapped = mapImportedRow(row, columns, { recipient_email: "EmailAddress", routing_key: "Sector" });
    expect(mapped.email_normalized).toBe("person@example.com");
    expect(mapped.routing_value).toBe("VIP");
    expect(mapped.data.annual_revenue).toBe("100");
    expect(mapped.original_data).toEqual(row);
  });
});
