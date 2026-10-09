import type { Metadata } from "next";
import { Toaster } from "sonner";
import { productName } from "@/lib/utils";
import brandIcon from "@/styles/autmail_icon.png";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: productName, template: `%s · ${productName}` },
  applicationName: productName,
  description: "AUTMAIL personalizes spreadsheet-driven emails for supported personal and work Microsoft mailboxes. Preview, review, and send with control.",
  icons: { icon: { url: brandIcon.src, type: "image/png" }, apple: { url: brandIcon.src, type: "image/png" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('outreach-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}` }} /></head>
      <body>
        {children}
        <Toaster position="top-right" closeButton toastOptions={{ style: { background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", boxShadow: "none" } }} />
      </body>
    </html>
  );
}
