"use client";

import { useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Mail, PenLine, Send, ShieldCheck, UserRound } from "lucide-react";

const sections = [
  { id: "microsoft", label: "Email account", icon: Mail, description: "Connect the Microsoft mailbox your emails will be sent from. You can practice without connecting." },
  { id: "signature", label: "Signature", icon: PenLine, description: "Build the sign-off recipients see at the end of your emails. Add only the lines and logo you need." },
  { id: "sending", label: "Sending", icon: Send, description: "Choose practice or real sending, and set the defaults for new email reviews." },
  { id: "account", label: "My account", icon: UserRound, description: "Update workspace details or change your login password. Neither changes your Microsoft sending address." },
  { id: "privacy", label: "Data & privacy", icon: ShieldCheck, description: "Manage addresses that must not receive emails, or remove your application data." },
] as const;
export type SettingsSection = typeof sections[number]["id"];

function snapshot(): SettingsSection {
  const hash = window.location.hash.slice(1);
  return sections.find((section) => section.id === hash)?.id ?? "microsoft";
}
function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => { window.removeEventListener("hashchange", callback); window.removeEventListener("popstate", callback); };
}
function select(id: SettingsSection) {
  if (snapshot() === id && window.location.hash === `#${id}`) return;
  window.history.pushState(null, "", `#${id}`);
  window.dispatchEvent(new Event("hashchange"));
}

export function SettingsTabs({ panels }: { panels: Record<SettingsSection, ReactNode> }) {
  const active = useSyncExternalStore(subscribe, snapshot, () => "microsoft" as SettingsSection);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % sections.length;
    else if (event.key === "ArrowLeft") next = (index + sections.length - 1) % sections.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = sections.length - 1;
    else return;
    event.preventDefault();
    document.getElementById(`settings-tab-${sections[next].id}`)?.focus();
    select(sections[next].id);
  }

  return <div className="space-y-6">
    <div className="rounded-xl border bg-[var(--muted)] p-2">
      <div role="tablist" aria-label="Settings sections" className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        {sections.map(({ id, label, icon: Icon }, index) => <button key={id} type="button" role="tab" id={`settings-tab-${id}`} aria-selected={active === id} aria-controls={`settings-panel-${id}`} tabIndex={active === id ? 0 : -1} onClick={() => select(id)} onKeyDown={(event) => navigate(event, index)} className={`focus-ring flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${active === id ? "bg-[var(--card)] text-[var(--primary)] shadow-[var(--shadow-card)]" : "text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--primary)]"}`}><Icon size={16} aria-hidden="true" />{label}</button>)}
      </div>
    </div>
    {sections.map(({ id }) => <section key={id} role="tabpanel" id={`settings-panel-${id}`} aria-labelledby={`settings-tab-${id}`} hidden={active !== id} tabIndex={0} className="focus-ring rounded-xl">
      {panels[id]}
    </section>)}
    {active !== "signature" && <p className="px-1 text-xs leading-6 text-[var(--muted-foreground)]">{active === "privacy" ? "Blocked-address changes apply immediately." : active === "microsoft" ? "Test connection sends no email. Send real test email sends one message after confirmation." : "Switching tabs keeps unfinished edits. Save before leaving Settings."}</p>}
  </div>;
}
