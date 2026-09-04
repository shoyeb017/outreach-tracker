import { describe, expect, it } from "vitest";
import { buildTemplateContext, extractPlaceholders, resolvePlaceholders, sanitizeEmailHtml } from "@/lib/templates/placeholders";
import { groupRoutingValues, normalizeRoutingValue, resolveTemplateForRow, suggestTemplate } from "@/lib/templates/routing";
import { resolveSubject } from "@/lib/email/subject";
import { rowTemplateData } from "@/lib/email/render";
import { dataPlaceholdersForTemplates } from "@/lib/templates/dataset-mapping";

describe("template resolution", () => {
  it("resolves custom, nested profile, and signature placeholders without evaluation", () => {
    const context = buildTemplateContext({ rowData: { company_name: "Northstar Labs", annual_revenue: "100" }, sender: { name: "Avery" }, signatureHtml: "<b>Avery</b>" });
    const result = resolvePlaceholders("Hi {{company_name}} — {{annual_revenue}} — {{profile.name}} {{signature}} {{missing}}", context);
    expect(result.output).toContain("Northstar Labs — 100 — Avery <b>Avery</b>");
    expect(result.missing).toEqual(["missing"]);
    expect(extractPlaceholders(result.output)).toEqual(["missing"]);
  });

  it("sanitizes dangerous HTML", () => {
    const sanitized = sanitizeEmailHtml('<p onclick="steal()">Hello</p><script>alert(1)</script><a href="javascript:bad()">x</a>');
    expect(sanitized).not.toMatch(/script|onclick|javascript:/i);
  });

  it("normalizes routing conservatively and only suggests exact matches", () => {
    const templates = [{ id: "finance", name: "Finance", category: "Financial Services & Banking", is_active: true, is_archived: false }];
    expect(normalizeRoutingValue("  FINANCIAL   Services & Banking ")).toBe("financial services & banking");
    expect(suggestTemplate("financial services & banking", templates as never)?.id).toBe("finance");
    expect(suggestTemplate("bank", templates as never)).toBeNull();
  });

  it("consolidates equivalent routing labels before a database upsert", () => {
    expect(groupRoutingValues([
      { routing_value: "Insurance", row_count: 2 },
      { routing_value: " insurance ", row_count: 3 },
      { routing_value: "INSURANCE", row_count: 1 },
    ])).toEqual([{
      normalized_value: "insurance",
      routing_value: "Insurance",
      row_count: 6,
      aliases: ["Insurance", "insurance", "INSURANCE"],
    }]);
  });

  it("maps any detected template placeholder to a chosen spreadsheet column", () => {
    const data = rowTemplateData(
      { data: { contact_person: "Jordan Lee", revenue: "250000" } },
      [{ id: "contact-column", placeholder_slug: "contact_person", standard_field: null }, { id: "revenue-column", placeholder_slug: "revenue", standard_field: null }],
      [{ placeholder: "decision_maker", column_id: "contact-column" }, { placeholder: "annual_revenue", column_id: "revenue-column" }],
    );
    expect(data).toMatchObject({ decision_maker: "Jordan Lee", annual_revenue: "250000" });
  });

  it("requires spreadsheet mapping only for non-sender placeholders", () => {
    expect(dataPlaceholdersForTemplates([{ subject_template: "Hello {{company_name}}", html_body: "<p>{{decision_maker}} {{profile.name}} {{signature}}</p>", plain_text_body: null }])).toEqual(["company_name", "decision_maker"]);
  });

  it("resolves overrides, routing rules, fallback, and skip in order", () => {
    const rules = [{ normalized_value: "vip", template_id: "vip-template", action: "template" as const }];
    expect(resolveTemplateForRow({ overrideTemplateId: "manual", routingValue: "VIP", rules, fallbackTemplateId: "fallback" })).toEqual({ templateId: "manual", source: "override" });
    expect(resolveTemplateForRow({ routingValue: " VIP ", rules, fallbackTemplateId: "fallback" })).toEqual({ templateId: "vip-template", source: "routing" });
    expect(resolveTemplateForRow({ routingValue: "Unknown", rules, fallbackTemplateId: "fallback" })).toEqual({ templateId: "fallback", source: "fallback" });
  });

  it("implements all subject strategies and fallback", () => {
    expect(resolveSubject("template", "Row subject", "Template subject")).toBe("Template subject");
    expect(resolveSubject("spreadsheet", "Row subject", "Template subject")).toBe("Row subject");
    expect(resolveSubject("spreadsheet_fallback", "", "Template subject")).toBe("Template subject");
    expect(resolveSubject("spreadsheet_fallback", "Row subject", "Template subject")).toBe("Row subject");
  });
});
