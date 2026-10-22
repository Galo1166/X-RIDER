import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";
import ThemeInit from "@/components/ThemeInit";
import "./globals.css";

export const metadata: Metadata = { title: "X-RIDER", description: "Cash-on-delivery dispatch riders" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><ThemeInit /><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
