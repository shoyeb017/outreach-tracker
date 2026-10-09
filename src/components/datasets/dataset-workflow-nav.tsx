import { Check } from "lucide-react";
import { datasetSteps, type DatasetStep } from "@/lib/datasets/workflow";

export function DatasetWorkflowNav({ current, complete, dirty = false, onSelect }: { current: DatasetStep; complete: boolean[]; dirty?: boolean; onSelect: (step: DatasetStep) => void }) {
  return <nav aria-label="Spreadsheet workflow" className="rounded-xl border bg-[var(--card)] p-2">
    <ol className="grid grid-cols-2 gap-2 xl:grid-cols-5">{datasetSteps.map((step, index) => {
      const active = current === step.key;
      return <li key={step.key} className="min-w-0 last:col-span-2 xl:last:col-span-1">
        <button type="button" aria-current={active ? "step" : undefined} onClick={() => onSelect(step.key)} className={`focus-ring flex h-full w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition ${active ? "border-[var(--primary)] bg-[var(--accent)]" : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-hover)]"}`}>
          <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>{index + 1}</span>
          <span className="min-w-0"><span className={`block text-sm font-semibold ${active ? "text-[var(--accent-foreground)]" : "text-[var(--foreground)]"}`}>{step.label}</span><span className="mt-1 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">{active && dirty ? "Unsaved changes" : complete[index] ? <><Check aria-hidden="true" size={12} />{index === 3 ? "Recipients selected" : "Saved"}</> : active ? "Current step" : "Not completed"}</span></span>
        </button>
      </li>;
    })}</ol>
  </nav>;
}
