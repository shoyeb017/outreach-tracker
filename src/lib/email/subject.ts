import type { SubjectStrategy } from "@/types";

export function resolveSubject(strategy: SubjectStrategy, spreadsheetSubject: unknown, renderedTemplateSubject: string): string {
  const spreadsheet = String(spreadsheetSubject ?? "").trim();
  const template = renderedTemplateSubject.trim();
  if (strategy === "template") return template;
  if (strategy === "spreadsheet") return spreadsheet;
  return spreadsheet || template;
}
