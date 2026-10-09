import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BlueTubesBackground } from "@/components/motion/blue-tubes-background";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="landing-page auth-shell" data-tubes-background>
    <BlueTubesBackground /><div className="landing-hero-scrim" aria-hidden="true" />
    <nav aria-label="Authentication navigation" className="auth-navigation mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <Link className="focus-ring" href="/" aria-label="AUTMAIL landing page"><BrandLogo /></Link>
      <div className="flex items-center gap-3"><Link href="/" className="focus-ring inline-flex items-center gap-2 text-sm"><ArrowLeft size={16} />Back to home</Link><ThemeToggle /></div>
    </nav>
    <div className="auth-content mx-auto grid w-full max-w-[1100px] items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_440px] lg:gap-20 lg:py-14">
      <section className="hidden min-w-0 lg:block" aria-label="Welcome to AUTMAIL">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)]"><Mail size={18} />Your email. A simpler workflow.</span>
        <p className="mt-5 max-w-md text-4xl font-semibold leading-tight tracking-tight">Personal email,<br />without the repetitive work.</p>
        <p className="mt-5 max-w-sm text-sm leading-7 text-[var(--muted-foreground)]">Connect your Microsoft mailbox, personalize your messages, and review every email before you send.</p>
        <p className="mt-8 flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><ShieldCheck size={16} />Your workspace and Microsoft connection stay separate.</p>
      </section>
      <div className="flex min-w-0 justify-center">{children}</div>
    </div>
  </main>;
}
