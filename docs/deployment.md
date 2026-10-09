# AUTMAIL production domain setup

Production website: [https://autmail.vercel.app](https://autmail.vercel.app).

## Which address goes where?

| Purpose | Exact production value | Where to save it |
| --- | --- | --- |
| Application origin | `https://autmail.vercel.app` | Vercel environment: `NEXT_PUBLIC_APP_URL` |
| Supabase default authentication destination | `https://autmail.vercel.app` | Supabase Authentication → URL Configuration → Site URL |
| Microsoft mailbox sign-in return address | `https://autmail.vercel.app/settings` | Entra app registration → Authentication → Single-page application |
| Supabase authentication callback | `https://autmail.vercel.app/auth/callback` | Supabase Authentication → URL Configuration → Redirect URLs |

The two redirects serve different login flows. Do not exchange them or put a path in `NEXT_PUBLIC_APP_URL`.

## 1. Vercel

Open the AUTMAIL project's **Settings → Environment Variables**. Set this for the **Production** environment:

```dotenv
NEXT_PUBLIC_APP_URL=https://autmail.vercel.app
```

Keep the other five deployment entries from `.env.example` configured with the existing project credentials. Never publish the service-role key or administrator password. Redeploy using the normal production build after changing environment values; repository comments alone do not configure Vercel.

Use your actual local origin, such as `http://localhost:3000`, in an uncommitted development environment. Preview deployments are separate origins and need intentionally approved environment values and redirects; do not point their public URL at production while opening a different hostname.

## 2. Supabase authentication

In **Authentication → URL Configuration**, save `https://autmail.vercel.app` as **Site URL**. Add the production callback to **Redirect URLs**, plus the explicit destinations the application's signup and password-reset actions use:

```text
https://autmail.vercel.app/auth/callback
https://autmail.vercel.app/auth/callback?next=/onboarding
https://autmail.vercel.app/auth/callback?next=/update-password
```

Prefer explicit production redirects rather than a wildcard covering unrelated Vercel sites. Review any custom email templates so confirmation and reset links honor the requested redirect instead of an old hardcoded website. See [Supabase's redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

## 3. Microsoft Entra mailbox connection

For **each registration used on production**, open **App registrations → Authentication → Add a platform → Single-page application** and save:

```text
https://autmail.vercel.app/settings
```

This includes the administrator's default registration and any allowed user-owned registrations. If a SPA platform already exists, add the URL to that platform. Match the HTTPS origin and lowercase path exactly; do not register it as Web, add a trailing slash, or substitute `/auth/callback`. See [Microsoft's redirect URI requirements](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).

Existing delegated permissions, supported account types, and organization consent still apply. Follow [Microsoft setup](admin-microsoft-setup.md) for those settings; changing a domain does not grant mailbox access.

## 4. Verify after changing the domain

1. Open the production website, not an old deployment or preview hostname.
2. Sign in with a normal user; verify email confirmation and password-reset links return to this website using a controlled account.
3. Sign in with the configured administrator. Changing the application origin invalidates existing environment administrator sessions, so sign in again.
4. Open **Settings → Email account**, reconnect the intended Microsoft mailbox, and run **Test connection**. Check the help page's copied redirect URL matches the new `/settings` address.
5. Confirm the connected sender before reviewing a campaign. A real test email is optional and requires its own explicit confirmation; a domain update does not authorize sending.

No new SQL migration is required solely for this domain change. Existing database migrations must still be installed. Remove obsolete provider redirect entries only after confirming they are no longer used by approved environments.

Complete the [release checklist](release-checklist.md). Documentation updates do not apply Vercel environment changes, Microsoft redirect registrations, or Supabase URL settings automatically.
