import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen grid-rows-[auto_1fr]"><nav className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-3 border-b px-5 py-4"><Link className="focus-ring" href="/" aria-label="AUTMAIL landing page"><BrandLogo /></Link><ThemeToggle /></nav><div className="flex items-start justify-center px-5 pb-16 pt-12 sm:pt-20">{children}</div></main>;
}
