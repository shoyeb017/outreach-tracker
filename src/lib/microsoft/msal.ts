"use client";

import { BrowserCacheLocation, PublicClientApplication, type AccountInfo } from "@azure/msal-browser";

const SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Send"];
const applications = new Map<string, PublicClientApplication>();

export async function getMsalApplication(tenantId: string, clientId: string) {
  const key = `${tenantId}:${clientId}`;
  let application = applications.get(key);
  if (!application) {
    application = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: `${window.location.origin}/settings`,
        postLogoutRedirectUri: `${window.location.origin}/settings`,
      },
      cache: { cacheLocation: BrowserCacheLocation.SessionStorage, storeAuthStateInCookie: false },
    });
    await application.initialize();
    applications.set(key, application);
  }
  return application;
}

export async function connectMicrosoft(tenantId: string, clientId: string) {
  const application = await getMsalApplication(tenantId, clientId);
  const response = await application.loginPopup({ scopes: SCOPES, prompt: "select_account" });
  application.setActiveAccount(response.account);
  return response.account;
}

export async function disconnectMicrosoft(tenantId: string, clientId: string) {
  const application = await getMsalApplication(tenantId, clientId);
  const account = application.getActiveAccount() ?? application.getAllAccounts()[0];
  if (account) await application.logoutPopup({ account, postLogoutRedirectUri: window.location.href });
}

export async function acquireGraphToken(tenantId: string, clientId: string): Promise<{ token: string; account: AccountInfo }> {
  const application = await getMsalApplication(tenantId, clientId);
  const account = application.getActiveAccount() ?? application.getAllAccounts()[0];
  if (!account) throw new Error("Connect your Microsoft account before sending.");
  try {
    const response = await application.acquireTokenSilent({ scopes: SCOPES, account });
    return { token: response.accessToken, account };
  } catch {
    const response = await application.acquireTokenPopup({ scopes: SCOPES, account });
    return { token: response.accessToken, account };
  }
}
