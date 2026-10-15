import { PageHeader } from "@/components/layout/page-header";
import { SchedulingControls } from "@/components/admin/scheduling-controls";
export const metadata = { title: "Scheduled sending administration" };
export default function SchedulingAdminPage() { return <><PageHeader eyebrow="Administration" title="Scheduled sending" description="Check the worker, manage the global sending switch, and review Free-plan safeguards." /><SchedulingControls /></>; }
