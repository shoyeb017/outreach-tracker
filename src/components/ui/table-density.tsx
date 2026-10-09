"use client";

export type TableDensity = "comfortable" | "compact";
export function TableDensityControl({ value, onChange }: { value: TableDensity; onChange: (value: TableDensity) => void }) {
  return <div role="group" aria-label="Row spacing" className="density-toggle">{(["comfortable", "compact"] as const).map((density) => <button type="button" key={density} aria-pressed={value === density} onClick={() => onChange(density)}>{density === "comfortable" ? "Comfortable" : "Compact"}</button>)}</div>;
}
