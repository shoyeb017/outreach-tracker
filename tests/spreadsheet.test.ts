import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createUniqueSlugs, mapImportedRow, normalizeColumnSlug, parseWorkbookData } from "@/lib/spreadsheet/parser";

describe("spreadsheet parsing and mapping", () => {
  it("normalizes custom headers and prevents slug collisions", () => {
    expect(normalizeColumnSlug(" Annual Révenue ")).toBe("annual_revenue");
    expect(createUniqueSlugs(["Company Name", "company-name", "", ""])).toEqual(["company_name", "company_name_2", "column", "column_2"]);
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
