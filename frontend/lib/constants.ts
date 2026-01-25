/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

export const BRAND = {
  name: "Crucible",
  shortName: "Crucible",
  fullName: "Crucible Community Edition",
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || "Crucible Community",
  legalCompanyName: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME || process.env.NEXT_PUBLIC_COMPANY_NAME || "Crucible Community",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@example.com",
  description: "Your AI Braintrust for strategic decision-making",
  tagline: "Your AI Braintrust.",
  edition: "Community Edition",
  copyrightYear: 2025,
  links: {
    dashboard: "/app",
    docs: "/docs",
    pricing: "/pricing",
    contact: "/contact",
    communityEdition: "/community-edition",
    signin: "/signin",
    signup: "/signup",
    protocolDemo: "https://www.youtube.com/embed/wxom4HfHxF4?rel=0&modestbranding=1",
    license: "/license",
  },
} as const;

export const NAV_LINKS = [
  { name: "Pricing", href: "/pricing", external: false },
  { name: "Docs", href: "/docs", external: false },
  { name: "About", href: "/about", external: false },
] as const;

// Social links - can be configured via environment variables
// Format: NEXT_PUBLIC_SOCIAL_TWITTER, NEXT_PUBLIC_SOCIAL_LINKEDIN, NEXT_PUBLIC_SOCIAL_GITHUB
export const SOCIAL_LINKS = [
  ...(process.env.NEXT_PUBLIC_SOCIAL_TWITTER ? [{ name: "Twitter", href: process.env.NEXT_PUBLIC_SOCIAL_TWITTER, icon: "twitter" as const }] : []),
  ...(process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN ? [{ name: "LinkedIn", href: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN, icon: "linkedin" as const }] : []),
  ...(process.env.NEXT_PUBLIC_SOCIAL_GITHUB ? [{ name: "GitHub", href: process.env.NEXT_PUBLIC_SOCIAL_GITHUB, icon: "github" as const }] : []),
] as const;

export const SESSION_ROUNDS = [
  { number: 1, name: "Position Cards", description: "Knights present their initial positions" },
  { number: 2, name: "Challenge Round", description: "Knights challenge each other's positions" },
  { number: 3, name: "Convergence", description: "Knights converge on a consensus" },
] as const;
