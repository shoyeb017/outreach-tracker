export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="workspace-intro mb-6 flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-start"><div className="min-w-0 flex-1">{eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}<h1 className="page-title">{title}</h1>{description && <p className="page-subtitle">{description}</p>}</div>{actions && <div className="flex min-w-0 flex-wrap items-center gap-3 xl:max-w-[45%]">{actions}</div>}</div>;
}
