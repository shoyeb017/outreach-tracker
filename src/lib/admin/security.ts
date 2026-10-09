export function sameOrigin(request: Request, configuredUrl: string | undefined) {
  if (!configuredUrl) return false;
  try { return request.headers.get("origin") === new URL(configuredUrl).origin && request.headers.get("sec-fetch-site") !== "cross-site"; } catch { return false; }
}
