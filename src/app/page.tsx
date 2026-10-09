import { ArrowRight, FileSpreadsheet, Mail, Route, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LandingMotion } from "@/components/motion/landing-motion";
import { BlueTubesBackground } from "@/components/motion/blue-tubes-background";
import { BrandLogo } from "@/components/brand/brand-logo";
import { FloatingMailScene } from "@/components/landing/floating-mail-scene";
import { LandingSignOut } from "@/components/landing/landing-sign-out";
import { getSignOutMicrosoftClientIds } from "@/lib/auth/logout-context";
import { productName } from "@/lib/utils";
import { publicNavigation } from "@/lib/public-navigation";

export default async function HomePage() {
  const navigation = await publicNavigation();
  const microsoftClientIds = navigation.signedIn ? await getSignOutMicrosoftClientIds() : [];
  return <main className="landing-page min-h-screen">
    <LandingMotion />
    <nav aria-label="Main navigation" className="landing-inner flex flex-wrap items-center justify-between gap-4 py-3">
      <Link href="/" aria-label="AUTMAIL landing page" className="focus-ring"><BrandLogo /></Link>
      <div className="flex flex-wrap items-center gap-2"><ButtonLink href="/help" variant="ghost">Help & safety</ButtonLink><ThemeToggle /><ButtonLink href={navigation.destination} variant="outline">{navigation.label}</ButtonLink>{navigation.signedIn && <LandingSignOut microsoftClientIds={microsoftClientIds} />}</div>
    </nav>
    <section className="landing-hero" aria-labelledby="landing-title">
      <BlueTubesBackground />
      <div className="landing-hero-scrim" aria-hidden="true" />
      <div className="landing-inner landing-hero-content grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--primary)]"><Mail size={16} /> Microsoft email automation</p>
          <h1 id="landing-title" className="hero-title mt-5"><span className="hero-word" style={{ animationDelay: "80ms" }}>Your spreadsheet.</span><br /><span className="hero-word" style={{ animationDelay: "200ms" }}>The right email.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-7">Turn spreadsheet rows into personal emails. Pick your templates, connect the fields, and check each message before you send.</p>
          <p className="mt-4 max-w-xl leading-7 text-[var(--muted-foreground)]">Start in practice mode. Connect your personal or work Microsoft mailbox when you’re ready. You decide who receives what.</p>
          <div className="mt-6 flex flex-wrap gap-3"><ButtonLink href={navigation.signedIn ? navigation.destination : "/register"}>{navigation.signedIn ? navigation.label : "Create your workspace"}<ArrowRight size={16} /></ButtonLink><ButtonLink href="/help" variant="outline">Read the setup guide</ButtonLink></div>
        </div>
        <FloatingMailScene />
      </div>
    </section>
    <section className="landing-inner landing-section" data-reveal>
      <p className="eyebrow">How it works</p><h2 className="mt-3 text-[clamp(1.375rem,3vw,1.875rem)] font-semibold leading-tight">Three things. One clear workflow.</h2>
      <div className="feature-grid stagger-grid mt-7">{[
        { Icon: FileSpreadsheet, title: "Bring your list", copy: "Upload Excel or CSV. Keep your column names and choose the recipient email column." },
        { Icon: Route, title: "Make it personal", copy: "Choose a template and connect its fields to your spreadsheet. Preview each recipient’s message." },
        { Icon: ShieldCheck, title: "Send with control", copy: "Practice first. Connect Microsoft, review your recipients, and confirm before sending real mail." },
      ].map(({ Icon, title, copy }) => <div key={title} className="surface-card feature-card border"><span className="feature-icon"><Icon size={24} strokeWidth={1.7} /></span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-3 leading-7 text-[var(--muted-foreground)]">{copy}</p></div>)}</div>
    </section>
    <section className="landing-inner landing-section" data-reveal><p className="eyebrow">A few helpful answers</p><h2 className="mt-3 text-2xl font-semibold">Before you start</h2><div className="mt-7 space-y-3">{[
      ["Will practice mode send emails?", "No campaign emails are sent in practice mode. Manual emails in Compose and test emails send real messages only after separate confirmation."],
      ["Which mailbox can I use?", "Connect a personal Outlook.com mailbox (including Hotmail, Live, or MSN) or a Microsoft 365 work or school mailbox. Your connection setup must allow your account type. Recipients can use any email provider."],
      ["Do I have to change my spreadsheet?", "No fixed layout is required. Choose your email column, then map the personal fields your templates need."],
    ].map(([question, answer]) => <details key={question} className="surface-card border p-5"><summary className="focus-ring cursor-pointer font-semibold leading-7">{question}</summary><p className="mt-3 max-w-3xl leading-7 text-[var(--muted-foreground)]">{answer}</p></details>)}</div></section>
    <footer className="landing-inner flex flex-wrap items-center justify-between gap-4 border-t py-7 text-sm text-[var(--muted-foreground)]"><p>{productName}. Built for deliberate outreach.</p><div className="flex flex-wrap gap-3"><ButtonLink href="/help" variant="ghost">Help & setup</ButtonLink><ButtonLink href="/help/safety" variant="ghost">Sending safety</ButtonLink></div></footer>
  </main>;
}
