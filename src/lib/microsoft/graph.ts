import { acquireGraphToken } from "./msal";
import { UncertainSendError } from "@/lib/sending/errors";

export interface GraphEmail { to: string; subject: string; htmlBody: string; saveToSentItems?: boolean }

export function graphErrorMessage(status: number) {
  if (status === 401) return "Your Microsoft session expired. Reconnect your account in Settings.";
  if (status === 403) return "Microsoft denied permission to send. Check Mail.Send permission with your Microsoft administrator.";
  if (status === 429) return "Microsoft is limiting requests. Wait before resuming.";
  return "Microsoft rejected this email. Review the recipient and try again.";
}

export async function verifyMicrosoftSender(tenantId: string, clientId: string, expectedEmail: string) {
  const { token, account } = await acquireGraphToken(tenantId, clientId);
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Reconnect Microsoft in Settings before sending.");
  const profile = await response.json() as { mail?: string; userPrincipalName?: string };
  if (![profile.mail, profile.userPrincipalName].some((email) => email?.toLowerCase() === expectedEmail.toLowerCase())) throw new Error("The active Microsoft account differs from the From account shown in review. Reconnect the intended account in Settings.");
  return account.username;
}

export async function sendGraphEmail(args: { tenantId: string; clientId: string; email: GraphEmail; liveEnabled: boolean; expectedAccount?: string; fetcher?: typeof fetch }) {
  if (!args.liveEnabled) return { status: "simulated" as const };
  const { token, account } = await acquireGraphToken(args.tenantId, args.clientId);
  if (args.expectedAccount && account.username.toLowerCase() !== args.expectedAccount.toLowerCase()) throw new Error("The Microsoft account changed. Reconnect the intended account before resuming.");
  const fetcher = args.fetcher ?? fetch;
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetcher("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { subject: args.email.subject, body: { contentType: "HTML", content: args.email.htmlBody }, toRecipients: [{ emailAddress: { address: args.email.to } }] }, saveToSentItems: args.email.saveToSentItems ?? true }),
      });
    } catch { throw new UncertainSendError(); }
    // Persisted 'sent' remains compatible with history; this represents acceptance, not delivery.
    if (response.status === 202) return { status: "sent" as const };
    if (response.ok) throw new UncertainSendError();
    if (response.status >= 500 || response.status === 408) throw new UncertainSendError();
    if (response.status !== 429 || attempt === 2) throw new Error(graphErrorMessage(response.status));
    const raw = response.headers.get("Retry-After");
    const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.max(0, (Date.parse(raw) - Date.now()) / 1000) : 0;
    await new Promise((resolve) => setTimeout(resolve, Math.min(60000, seconds ? seconds * 1000 : 1000 * 2 ** attempt)));
  }
  throw new Error("Microsoft did not accept this email.");
}
