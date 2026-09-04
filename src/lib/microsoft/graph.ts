import { acquireGraphToken } from "./msal";

export interface GraphEmail { to: string; subject: string; htmlBody: string; saveToSentItems?: boolean }

export function graphErrorMessage(status: number) {
  if (status === 401) return "Your Microsoft session expired. Reconnect and resume this send.";
  if (status === 403) return "Microsoft denied Mail.Send. Confirm delegated Mail.Send consent in Entra.";
  if (status === 429) return "Microsoft Graph is throttling requests. The queue will retry shortly.";
  if (status >= 500) return "Microsoft Graph is temporarily unavailable.";
  return "Microsoft Graph could not send this message.";
}

export async function sendGraphEmail(args: { tenantId: string; clientId: string; email: GraphEmail; liveEnabled: boolean; fetcher?: typeof fetch }) {
  if (!args.liveEnabled) return { status: "simulated" as const };
  const { token } = await acquireGraphToken(args.tenantId, args.clientId);
  const fetcher = args.fetcher ?? fetch;
  let lastError = "Microsoft Graph could not send this message.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: args.email.subject,
            body: { contentType: "HTML", content: args.email.htmlBody },
            toRecipients: [{ emailAddress: { address: args.email.to } }],
          },
          saveToSentItems: args.email.saveToSentItems ?? true,
        }),
      });
      if (response.ok) return { status: "sent" as const };
      lastError = graphErrorMessage(response.status);
      if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(lastError);
      const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, retryAfter ? retryAfter * 1000 : 600 * 2 ** attempt));
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt === 2 || /denied|expired/i.test(lastError)) throw new Error(lastError);
      await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
    }
  }
  throw new Error(lastError);
}
