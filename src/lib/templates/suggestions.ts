import type { EmailTemplate } from "@/types";

type SuggestibleTemplate = Pick<EmailTemplate, "id" | "name" | "category" | "is_active" | "is_archived">;
export interface TemplateSuggestion<T> { template: T; method: "exact" | "phrase" | "typo"; matchedLabel: string }

// Deliberate business synonyms, not broad industry guesses or location lists.
const aliases = new Map<string, string[]>([
  ["marketing agency", ["marketing firm"]],
  ["digital marketing agency", ["digital marketing firm", "online marketing agency"]],
  ["it company", ["information technology company"]],
  ["it consulting company", ["it consulting", "it consultancy", "information technology consulting"]],
  ["software company", ["software development company", "software development firm"]],
  ["business consulting", ["business consultancy", "business consultant", "business consulting firm"]],
  ["management consulting", ["management consultancy", "management consultant"]],
  ["accounting firm", ["accountancy firm", "accounting service", "accountant"]],
  ["bookkeeping service", ["bookkeeping company", "bookkeeping firm", "bookkeeper"]],
  ["recruitment agency", ["recruiting agency", "staffing agency", "recruitment firm"]],
  ["construction company", ["construction firm"]],
  ["general contractor", ["general contracting company", "general contracting"]],
  ["real estate agency", ["real estate brokerage", "estate agency"]],
  ["property management company", ["property management", "property manager"]],
  ["landscaping company", ["landscaping service", "landscaping contractor", "landscape company", "landscape contractor", "landscaper"]],
]);
const plurals = new Map([
  ["agencies", "agency"], ["companies", "company"], ["firms", "firm"], ["services", "service"],
  ["contractors", "contractor"], ["consultants", "consultant"], ["accountants", "accountant"],
  ["bookkeepers", "bookkeeper"], ["managers", "manager"], ["landscapers", "landscaper"],
]);
const generic = new Set(["general", "business", "company", "service", "agency", "firm", "consulting", "consultant", "marketing", "it", "other", "template", "outreach", "email", "mail", "default", "test", "support"]);
const suffixes = new Set(["outreach", "template", "email", "draft", "message", "copy"]);
function exactKey(value: unknown) { return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
function words(value: unknown) {
  const raw = String(value ?? "").slice(0, 2000).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return raw.filter(word => word !== "and").map(word => plurals.get(word) ?? word).slice(0, 128);
}
function meaningful(terms: string[]) { return terms.length > 1 || (terms[0]?.length >= 4 && !generic.has(terms[0])); }

// One edit only; short words permit a transposition, not e.g. farm -> firm.
function smallTypo(left: string, right: string) {
  if (left === right || Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length && left.length >= 4) {
    let first = 0; while (first < left.length && left[first] === right[first]) first++;
    if (first + 1 < left.length && left[first] === right[first + 1] && left[first + 1] === right[first]
      && left.slice(first + 2) === right.slice(first + 2)) return true;
  }
  if (Math.min(left.length, right.length) < 5) return false;
  let a = 0, b = 0, edits = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) { a++; b++; continue; }
    if (++edits > 1) return false;
    if (left.length >= right.length) a++;
    if (right.length >= left.length) b++;
  }
  return edits + (a < left.length || b < right.length ? 1 : 0) === 1;
}

/** Suggestions never save a routing rule. Ambiguous matches require a manual choice. */
export function suggestTemplateMatch<T extends SuggestibleTemplate>(value: unknown, templates: T[]): TemplateSuggestion<T> | null {
  const normalized = exactKey(value);
  if (!normalized) return null;
  const candidates = templates.filter(template => template.is_active && !template.is_archived);
  // Preserve the existing exact-category-before-exact-name behavior, including ambiguity.
  for (const field of ["category", "name"] as const) {
    const exact = candidates.filter(template => exactKey(template[field]) === normalized);
    if (exact.length) return exact.length === 1 ? { template: exact[0], method: "exact", matchedLabel: exact[0][field]! } : null;
  }
  const input = words(value);
  const phrases = candidates.flatMap(template => {
    const name = words(template.name);
    while (name.length && suffixes.has(name.at(-1)!)) name.pop();
    const labels = [{ terms: words(template.category), label: template.category ?? template.name }, { terms: name, label: template.name }];
    const seen = new Set<string>();
    return labels.flatMap(({ terms, label }) => [terms, ...(aliases.get(terms.join(" ")) ?? []).map(words)].flatMap(phrase => {
      const key = phrase.join(" ");
      if (!meaningful(phrase) || phrase.length > 16 || seen.has(key)) return [];
      seen.add(key); return [{ template, terms: phrase, label }];
    }));
  });
  for (const allowTypo of [false, true]) {
    const matches: { template: T; start: number; length: number; label: string }[] = [];
    for (const phrase of phrases) {
      if (allowTypo && phrase.terms.length < 2) continue;
      for (let start = 0; start <= input.length - phrase.terms.length; start++) {
        // Do not recommend explicitly negated business types.
        if (input.slice(Math.max(0, start - 3), start).some(word => ["not", "no", "excluding", "except", "without"].includes(word))) continue;
        let errors = 0;
        const matched = phrase.terms.every((word, index) => input[start + index] === word || (allowTypo && ++errors <= 1 && smallTypo(input[start + index], word)));
        if (matched && (!allowTypo || errors === 1)) { matches.push({ template: phrase.template, start, length: phrase.terms.length, label: phrase.label }); break; }
      }
    }
    // Location text is irrelevant: prefer the first recognized business phrase,
    // and the longest phrase at that position (Digital marketing beats Marketing).
    matches.sort((a, b) => a.start - b.start || b.length - a.length);
    const best = matches[0]; if (!best) continue;
    const winners = new Map(matches.filter(match => match.start === best.start && match.length === best.length).map(match => [match.template.id, match]));
    if (winners.size !== 1) return null;
    return { template: best.template, method: allowTypo ? "typo" : "phrase", matchedLabel: best.label };
  }
  return null;
}

export function suggestTemplate<T extends SuggestibleTemplate>(value: unknown, templates: T[]): T | null {
  return suggestTemplateMatch(value, templates)?.template ?? null;
}
