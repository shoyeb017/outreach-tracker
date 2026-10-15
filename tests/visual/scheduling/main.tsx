import { createRoot } from "react-dom/client";
import { ScheduledMailHub } from "@/components/scheduling/scheduled-mail-hub";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import "@/app/globals.css";
createRoot(document.getElementById("root")!).render(<><header className="flex items-center justify-between border-b p-3 text-xs"><span>Isolated component test — no production connection or real sending</span><ThemeToggle /></header><ScheduledMailHub /></>);
