/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/styles/globals.css";
import { BRAND, SOCIAL_LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { TurnstileProvider } from "@/components/providers/TurnstileProvider";
import { ToastProvider } from "@/components/common/ToastProvider";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { StructuredData } from "@/components/seo/StructuredData";
import { generateOrganizationSchema } from "@/lib/schema";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

export const metadata: Metadata = {
  title: `${BRAND.fullName} : Your AI Braintrust`,
  description: `${BRAND.description} - ${BRAND.edition}`,
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  // Next.js 13+ automatically uses app/icon.svg or app/icon.tsx
  // We keep this as fallback for older browsers and explicit paths
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Generate Organization schema for GEO
  const organizationSchema = generateOrganizationSchema({
    name: BRAND.companyName,
    legalName: BRAND.companyName,
    url: siteUrl || "",
    logo: siteUrl ? `${siteUrl}/icon.svg` : "/icon.svg",
    description: "AI-powered decision-intelligence platform for high-stakes business decisions",
    sameAs: SOCIAL_LINKS.map((link) => link.href),
    email: BRAND.contactEmail,
  });

  return (
    <html lang="en" className="bg-base-bg text-base-text">
      <body
        className={cn(
          "min-h-screen bg-base-bg text-base-text antialiased",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <StructuredData schema={organizationSchema} />
        <ErrorBoundary>
          <AuthProvider>
            <TurnstileProvider>
              <QueryProvider>
                <ToastProvider>{children}</ToastProvider>
              </QueryProvider>
            </TurnstileProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
