"use client";

import { BrowserCacheLocation, InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from "@azure/msal-browser";
import { authorityAllowed, humanMicrosoftError, type ResolvedMicrosoftConfiguration } from "./authority";

export const GRAPH_SCOPES = ["User.Read", "Mail.Send"];
const applications = new Map<string, Promise<PublicClientApplication>>();
export async function selectedConfiguration(tenantId: string, clientId: string) {
  const response = await fetch(`/api/microsoft/configuration?${new URLSearchParams({ tenantId, clientId })}`, { cache: "no-store" });
  const data = await response.json() as { configuration?: ResolvedMicrosoftConfiguration; error?: string };
  if (!response.ok || !data.configuration) throw new Error(data.error ?? "Choose a Microsoft configuration in Settings.");
  if (!authorityAllowed(data.configuration.authority)) throw new Error("Unsafe Microsoft authority was rejected.");
  return data.configuration;
}
async function applicationFor(configuration: ResolvedMicrosoftConfiguration) {
  const key = `${configuration.id}:${configuration.client_id}:${configuration.authority}`;
  let ready = applications.get(key);
  if (!ready) {
    ready = (async () => {
      const application = new PublicClientApplication({
        auth: { clientId: configuration.client_id, authority: configuration.authority, redirectUri: `${window.location.origin}/settings`, postLogoutRedirectUri: `${window.location.origin}/settings` },
        cache: { cacheLocation: BrowserCacheLocation.SessionStorage, storeAuthStateInCookie: false },
      });
      await application.initialize();
      return application;
    })();
    applications.set(key, ready);
    ready.catch(() => applications.delete(key));
  }
  return ready;
}
export async function getMsalApplication(tenantId: string, clientId: string) { return applicationFor(await selectedConfiguration(tenantId, clientId)); }

export async function clearWorkspaceMicrosoftSessions(clientIds: string[] = []) {
  for (const ready of applications.values()) await (await ready).clearCache();
  // A fresh page may have no initialized instances, but sessionStorage can still contain old tokens.
  for (const clientId of new Set(clientIds)) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) continue;
    const application = new PublicClientApplication({ auth: { clientId, authority: "https://login.microsoftonline.com/common" }, cache: { cacheLocation: BrowserCacheLocation.SessionStorage } });
    await application.initialize();
    await application.clearCache();
  }
  applications.clear();
}

export async function connectMicrosoft(tenantId: string, clientId: string): Promise<AccountInfo> {
  try {
    let configuration = await selectedConfiguration(tenantId, clientId);
    let application = await applicationFor(configuration);
    let response;
    try { response = await application.loginPopup({ scopes: GRAPH_SCOPES, prompt: "select_account" }); }
    catch (error) {
      const message = error && typeof error === "object" && "errorMessage" in error ? String(error.errorMessage) : error instanceof Error ? error.message : "";
      if (configuration.verification !== "unverified" || configuration.authority !== "https://login.microsoftonline.com/common" || !/AADSTS50194/i.test(message)) throw error;
      // Retry only Microsoft's explicit single-tenant/common-endpoint error, never consent,
      // cancellation, account mismatch, or network failures. Do not call this audience detection.
      const retry = await fetch("/api/microsoft/configuration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select", method: configuration.method, id: configuration.id, signInEndpoint: "tenant" }) });
      const result = await retry.json();
      if (!retry.ok || !result.configuration || result.configuration.authority !== `https://login.microsoftonline.com/${configuration.tenant_id}`) throw new Error(result.error ?? "The Microsoft registration changed. Click Connect again.");
      configuration = result.configuration;
      application = await applicationFor(configuration);
      response = await application.loginPopup({ scopes: GRAPH_SCOPES, prompt: "select_account" });
    }
    if (!response.account) throw new Error("Microsoft did not return a signed-in account.");
    if (!response.scopes.some((scope) => /(?:^|\/)Mail\.Send$/i.test(scope))) throw new Error("Microsoft did not grant Mail.Send. Reconnect and ask your administrator to check delegated permission consent.");
    const accountType = response.account.tenantId === "9188040d-6c67-4c5b-b112-36a304b66dad" ? "personal" : response.account.tenantId ? "organization" : "unknown";
    const saved = await fetch("/api/microsoft/configuration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect", accessToken: response.accessToken, homeAccountId: response.account.homeAccountId, authority: configuration.authority, configurationId: configuration.id, clientId: configuration.client_id, accountType }) });
    const result = await saved.json();
    if (!saved.ok) throw new Error(result.error ?? "Could not save the connected sender.");
    application.setActiveAccount(response.account);
    return response.account;
  } catch (error) { throw new Error(humanMicrosoftError(error)); }
}
export async function disconnectMicrosoft(tenantId: string, clientId: string) {
  const configuration = await selectedConfiguration(tenantId, clientId);
  const application = await applicationFor(configuration);
  const account = configuration.home_account_id ? application.getAccountByHomeId(configuration.home_account_id) : null;
  // Local logout, not a tenant-wide account logout. Never pick the first cached account.
  if (account) await application.clearCache({ account });
  application.setActiveAccount(null);
}
export async function acquireGraphToken(tenantId: string, clientId: string, requireSending = true, options: { scopes?: string[]; interactive?: boolean } = {}): Promise<{ token: string; account: AccountInfo; grantedScopes?: string[] }> {
  const configuration = await selectedConfiguration(tenantId, clientId);
  if (!configuration.home_account_id) throw new Error("Reconnect your selected Microsoft sender in Settings before sending.");
  const application = await applicationFor(configuration);
  const account = application.getAccountByHomeId(configuration.home_account_id);
  if (!account) throw new Error("This browser has no session for the selected sender. Reconnect in Settings.");
  let response;
  const scopes = options.scopes ?? (requireSending ? GRAPH_SCOPES : ["User.Read"]);
  try { response = await application.acquireTokenSilent({ scopes, account }); }
  catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) throw new Error(humanMicrosoftError(error));
    if (options.interactive === false) throw new Error(`Enable mailbox access to approve ${scopes.filter((scope) => scope !== "User.Read").join(" and ") || "Microsoft access"} for your own connected mailbox. If your browser session expired, reconnect in Settings.`);
    try { response = await application.acquireTokenPopup({ scopes, account }); }
    catch (popupError) { throw new Error(humanMicrosoftError(popupError)); }
  }
  if (!response.account || response.account.homeAccountId !== account.homeAccountId) throw new Error("The Microsoft account changed. Reconnect the intended sender before resuming.");
  if (requireSending && !response.scopes.some((scope) => /(?:^|\/)Mail\.Send$/i.test(scope))) throw new Error("Microsoft did not grant Mail.Send. Reconnect and review delegated permissions.");
  const granted = new Set(response.scopes.map((scope) => scope.replace(/^https:\/\/graph\.microsoft\.com\//i, "").toLowerCase()));
  const missing = scopes.filter((scope) => !granted.has(scope.toLowerCase()) && !(scope.toLowerCase() === "mail.read" && granted.has("mail.readwrite")));
  if (options.scopes && missing.length) throw new Error(`Microsoft did not grant ${missing.join(" and ")}. Approve the delegated permission when prompted. If your organization requires admin approval, ask your Microsoft administrator and see Help → Microsoft permissions.`);
  return { token: response.accessToken, account: response.account, ...(!requireSending ? { grantedScopes: response.scopes } : {}) };
}
