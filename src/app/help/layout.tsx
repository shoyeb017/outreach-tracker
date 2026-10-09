import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { HelpNavigation } from "@/components/help/help-navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { publicNavigation } from "@/lib/public-navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const navigation = await publicNavigation();
  return <div>
    <header className="workspace-navbar sticky top-0 z-30 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
      <ButtonLink href={navigation.helpDestination} variant="outline" className="w-full sm:w-auto">
        <ArrowLeft size={16} className="shrink-0" aria-hidden="true" />
        {navigation.helpLabel}
      </ButtonLink>
      <div className="flex flex-wrap items-center gap-3"><Link href="/help" className="focus-ring inline-flex flex-wrap items-center gap-2"><BrandLogo /><span className="text-xs font-semibold">Help center</span></Link><ButtonLink href="/" variant="ghost">Landing page</ButtonLink><ThemeToggle /></div>
    </header>
    <div className="page-shell help-shell"><aside className="help-sidebar"><HelpNavigation returnHref={navigation.helpDestination} returnLabel={navigation.helpLabel} /></aside><main className="help-document">{children}</main></div>
  </div>;
}
