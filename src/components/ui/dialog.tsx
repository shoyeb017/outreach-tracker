"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

export function Dialog({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className={`ui-dialog m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] ${wide ? "max-w-6xl" : "max-w-3xl"} overflow-auto border bg-[var(--card)] text-[var(--foreground)] p-0 backdrop:bg-black/50`}>
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-[var(--card)] px-4 py-4 sm:px-6"><h2 className="min-w-0 break-words text-lg font-semibold leading-7">{title}</h2><Button variant="ghost" size="icon" aria-label={`Close ${title}`} onClick={onClose}><X size={18} /></Button></div>
    <div className="min-w-0 break-words p-4 sm:p-6">{children}</div>
  </dialog>;
}
