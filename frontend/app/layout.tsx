import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chatter — WhatsApp-style chat",
  description: "Real-time chat with groups, attachments, and a live shared terminal",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
