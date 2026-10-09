type Environment = Record<string, string | undefined>;

export function validateProductionEnvironment(environment: Environment) {
  if (environment.NEXT_PUBLIC_AUTMAIL_UI_TEST_MODE === "true") {
    if (environment.VERCEL || environment.NEXT_PUBLIC_SUPABASE_URL || environment.NEXT_PUBLIC_SUPABASE_ANON_KEY || environment.SUPABASE_SERVICE_ROLE_KEY || environment.ADMIN_LOGIN_EMAIL || environment.ADMIN_LOGIN_PASSWORD) {
      throw new Error("UI-test builds cannot use deployment settings or real service credentials. Use the normal build command for deployment.");
    }
    if (environment.NEXT_PUBLIC_APP_URL !== "http://127.0.0.1:3107") throw new Error("UI-test builds are restricted to the isolated browser-test origin.");
    return;
  }
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_APP_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(", ")}. Set these environment variables before building. No preview workspace is enabled automatically.`);
  function configuredUrl(name: string) {
    try {
      const url = new URL(environment[name]!);
      if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
      return url;
    } catch { throw new Error(`${name} must be an absolute origin without credentials, a path, or query parameters.`); }
  }
  const database = configuredUrl("NEXT_PUBLIC_SUPABASE_URL");
  const application = configuredUrl("NEXT_PUBLIC_APP_URL");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(application.hostname);
  if (database.protocol !== "https:" || application.protocol !== "https:" && !(loopback && !environment.VERCEL && application.protocol === "http:")) {
    throw new Error("Production service URLs must use HTTPS. HTTP is allowed only for a local application build, never a Vercel deployment.");
  }
  if (environment.VERCEL && loopback) throw new Error("NEXT_PUBLIC_APP_URL must be your deployed website origin, not localhost.");
  const publicKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let serviceRoleToken = false;
  try { serviceRoleToken = JSON.parse(Buffer.from(publicKey.split(".")[1], "base64url").toString()).role === "service_role"; } catch { /* Publishable keys need not be JWTs. */ }
  if (publicKey === environment.SUPABASE_SERVICE_ROLE_KEY || publicKey.startsWith("sb_secret_") || serviceRoleToken) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY must be a public anon/publishable key, never a service-role or secret key.");
  if (environment.ADMIN_LOGIN_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(environment.ADMIN_LOGIN_EMAIL.trim())) throw new Error("ADMIN_LOGIN_EMAIL must be a valid administrator email address.");
  if (environment.ADMIN_LOGIN_PASSWORD && (!environment.ADMIN_LOGIN_EMAIL?.trim() || environment.ADMIN_LOGIN_PASSWORD.length > 256)) throw new Error("ADMIN_LOGIN_PASSWORD requires ADMIN_LOGIN_EMAIL and must not exceed 256 characters.");
}
