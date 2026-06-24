import type { Metadata } from "next";
import "./globals.css";

import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "WhatsApp+",
  description: "Chat, groups, attachments, status, and a live terminal",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
