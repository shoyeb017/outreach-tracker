// @vitest-environment node
import { describe, expect, it } from "vitest";
import { suggestTemplate, suggestTemplateMatch } from "@/lib/templates/routing";

function template(category: string, id = category) {
  return { id, category, name: `${category} Outreach`, is_active: true, is_archived: false };
}
const templates = ["Accounting firm", "Business consulting", "Marketing agency", "Digital marketing agency", "IT company", "IT consulting company", "Software company", "Recruitment agency", "Landscaping company", "Real estate agency"].map(category => template(category));

describe("business-aware template suggestions", () => {
  it.each([
    ["Accounting firm Arlington, Virginia", "Accounting firm"],
    ["Accounting firm Arlington, Virginia, Business consulting Arlington", "Accounting firm"],
    ["Business consulting Arlington, Accounting firm Arlington, Virginia", "Business consulting"],
    ["Digital marketing agency Arlington, Virginia", "Digital marketing agency"],
    ["IT consulting company Arlington", "IT consulting company"],
    ["Software development company Arlington", "Software company"],
    ["ACCOUNTING FIRMS — Arlington, VA", "Accounting firm"],
    ["Accountancy firm Alexandria", "Accounting firm"],
    ["Staffing agencies Virginia Beach", "Recruitment agency"],
    ["Landscapers Richmond, VA", "Landscaping company"],
    ["Real-estate agency Fairfax", "Real estate agency"],
    ["Acounting firm Arlington", "Accounting firm"],
    ["Accounting frim Arlington", "Accounting firm"],
  ])("matches %s without depending on template list order", (value, expected) => {
    expect(suggestTemplate(value, templates)?.category).toBe(expected);
    expect(suggestTemplate(value, [...templates].reverse())?.category).toBe(expected);
  });

  it("explains exact, phrase and possible spelling matches", () => {
    expect(suggestTemplateMatch(" accounting firm ", templates)).toMatchObject({ method: "exact", matchedLabel: "Accounting firm" });
    expect(suggestTemplateMatch("Accounting firm Arlington", templates)).toMatchObject({ method: "phrase", matchedLabel: "Accounting firm" });
    expect(suggestTemplateMatch("Acounting firm Arlington", templates)).toMatchObject({ method: "typo", matchedLabel: "Accounting firm" });
  });

  it("prefers a recognized phrase over a speculative earlier typo", () => {
    expect(suggestTemplate("Acounting firm Arlington, Business consulting Arlington", templates)?.category).toBe("Business consulting");
  });

  it("preserves full exact category/name priority", () => {
    const specific = template("Accounting firm Arlington");
    expect(suggestTemplate(specific.category, [...templates, specific])).toBe(specific);
    const copy = { ...template("Accounting firm", "copy"), name: "My accounting introduction" };
    expect(suggestTemplate(copy.name, [...templates, copy])).toBe(copy);
    const categoryBeforeName = { ...template("Other category", "other"), name: "Accounting firm" };
    expect(suggestTemplate("Accounting firm", [...templates, categoryBeforeName])?.id).toBe("Accounting firm");
  });

  it.each(["Accounting firm", "Accounting firm Arlington, Business consulting Arlington", "Acounting firm Arlington"])("does not arbitrarily choose between duplicate templates for %s", value => {
    expect(suggestTemplate(value, [...templates, template("Accounting firm", "personal-copy")])).toBeNull();
  });

  it("ignores archived/inactive templates and does not invent unavailable templates", () => {
    expect(suggestTemplate("Accounting firm Arlington", [{ ...templates[0], is_active: false }, { ...templates[0], id: "archived", is_archived: true }])).toBeNull();
    expect(suggestTemplate("Accounting firm Arlington", templates.slice(1))).toBeNull();
  });

  it.each(["Accounting farm Arlington", "Accounting frrm Arlngton", "company", "business", "IT", "bank", "An unrelated company Arlington", "Not accounting firm Arlington", "No digital marketing agency Arlington", "", null, undefined, 123])("leaves unsupported or unsafe guesses unselected: %s", value => {
    expect(suggestTemplate(value, templates)).toBeNull();
  });

  it("compares whole words and normalizes punctuation, accents and ampersands", () => {
    expect(suggestTemplate("Lawrence company", [template("Law")])).toBeNull();
    expect(suggestTemplate("Café & Catering Richmond", [template("Cafe and Catering")])?.category).toBe("Cafe and Catering");
    expect(suggestTemplate("Financial services and banking Arlington", [template("Financial Services & Banking")])?.category).toBe("Financial Services & Banking");
  });

  it("bounds long input and safely accepts prototype-like labels", () => {
    expect(suggestTemplate("x ".repeat(5000) + "Accounting firm", templates)).toBeNull();
    expect(suggestTemplate("constructor Arlington", [template("constructor")])?.category).toBe("constructor");
  });
});
