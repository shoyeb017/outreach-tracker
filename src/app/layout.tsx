import type { Metadata } from "next";
import { Toaster } from "sonner";
import { productName } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: productName, template: `%s · ${productName}` },
  description: "A secure, spreadsheet-driven email automation workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
