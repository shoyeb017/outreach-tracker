import { requireAdministrator, privilegedDatabase } from "@/lib/admin/server";
import { PageHeader } from "@/components/layout/page-header";
import { MicrosoftDefaultForm } from "@/components/admin/microsoft-default-form";
export default async function AdminMicrosoftPage() {
  await requireAdministrator(); const { data, error } = await privilegedDatabase().from("microsoft_default_configuration").select("*").maybeSingle();
  return <main><PageHeader eyebrow="Shared setup" title="Default Microsoft configuration" description="Set up the app once. Users connect their own sending mailbox with it." />{error ? <p role="alert" className="border p-6">Settings are unavailable. Apply the Microsoft administration migration first.</p> : <MicrosoftDefaultForm initial={data} />}</main>;
}
