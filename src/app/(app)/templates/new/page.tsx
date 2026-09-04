import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateForm } from "@/components/templates/template-form";
import { Button } from "@/components/ui/button";

export default function NewTemplatePage() { return <main className="page-shell"><PageHeader eyebrow="Template library" title="Create personal template" description="Write once, personalize safely, and route at send time." actions={<Link href="/templates"><Button variant="outline"><ArrowLeft size={15} />Back to templates</Button></Link>} /><TemplateForm /></main>; }
