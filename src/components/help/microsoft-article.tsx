import { CopyUrl } from "./copy-url";
import { parseConnectionErrors } from "@/lib/help/documents";
// Interactive additions to the Markdown guides. The complete text also exists in their .md source.
export function MicrosoftArticle({ topic, markdown, redirectUrl }: { topic: string; markdown: string; redirectUrl: string | null }) {
  const troubleshooting = parseConnectionErrors(markdown);
  return <div className="space-y-7">
    {topic === "troubleshooting" && <section aria-label="Common Microsoft errors">{troubleshooting.map(({ title, answers }) => <details key={title} className="doc-error"><summary>{title}</summary><dl>{answers.map(({ label, text }) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl></details>)}</section>}
    <section><h2 id="exact-microsoft-redirect-url">Exact Microsoft redirect URL</h2>{redirectUrl ? <><CopyUrl value={redirectUrl} /><p>Register this exact /settings URL under Single-page application. Match protocol, domain, port, and path. /auth/callback belongs to Supabase workspace login, not Microsoft mailbox sign-in.</p></> : <p role="alert">The website address has not been configured. Ask the application administrator to set the deployed application URL before registering a Microsoft redirect.</p>}</section>
  </div>;
}
