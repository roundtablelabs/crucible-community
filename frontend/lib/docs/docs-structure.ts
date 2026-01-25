export type DocSection = {
  title: string;
  slug: string;
  href: string;
  description?: string;
  pages?: DocPage[];
  children?: DocSection[];
};

export type DocPage = {
  title: string;
  slug: string;
  description?: string;
};

export const DOCS_STRUCTURE: DocSection[] = [
  {
    title: "Getting Started",
    slug: "getting-started",
    href: "/docs/getting-started",
    description: "Learn the basics of using Crucible",
    children: [
      {
        title: "Core Concepts",
        slug: "core-concepts",
        href: "/docs/getting-started/core-concepts",
      },
      {
        title: "Quick Start",
        slug: "quick-start",
        href: "/docs/getting-started/quick-start",
      },
    ],
  },
  {
    title: "Sessions",
    slug: "sessions",
    href: "/docs/sessions",
    description: "Create and manage debate sessions",
    children: [
      {
        title: "Creating Sessions",
        slug: "creating",
        href: "/docs/sessions/creating",
      },
      {
        title: "Framing Questions",
        slug: "framing-questions",
        href: "/docs/sessions/framing-questions",
      },
      {
        title: "Agents",
        slug: "agents",
        href: "/docs/sessions/agents",
      },
      {
        title: "Rounds",
        slug: "rounds",
        href: "/docs/sessions/rounds",
      },
      {
        title: "Artifacts",
        slug: "artifacts",
        href: "/docs/sessions/artifacts",
      },
      {
        title: "Management",
        slug: "management",
        href: "/docs/sessions/management",
      },
    ],
  },
  {
    title: "Guides",
    slug: "guides",
    href: "/docs/guides",
    description: "Advanced guides and best practices",
    children: [
      {
        title: "Best Practices",
        slug: "best-practices",
        href: "/docs/guides/best-practices",
      },
      {
        title: "Use Cases",
        slug: "use-cases",
        href: "/docs/guides/use-cases",
      },
      {
        title: "Comparison",
        slug: "comparison",
        href: "/docs/guides/comparison",
      },
      {
        title: "Advanced",
        slug: "advanced",
        href: "/docs/guides/advanced",
      },
      {
        title: "FAQ",
        slug: "faq",
        href: "/docs/guides/faq",
      },
    ],
  },
  {
    title: "Glossary",
    slug: "glossary",
    href: "/docs/glossary",
    description: "Definitions of key terms and concepts",
  },
  {
    title: "Community Edition",
    slug: "community-edition",
    href: "/docs/community-edition",
    description: "Self-hosted deployment guide",
    children: [],
  },
];

export function getBreadcrumbs(sectionSlug: string, pageSlug?: string): Array<{ title: string; href: string }> {
  const breadcrumbs: Array<{ title: string; href: string }> = [
    { title: "Docs", href: "/docs" },
  ];

  // Find the main section
  const section = DOCS_STRUCTURE.find((s) => s.slug === sectionSlug);
  if (section) {
    breadcrumbs.push({
      title: section.title,
      href: `/docs/${section.slug}`,
    });

    // If there's a pageSlug, it's a child section
    if (pageSlug && section.children) {
      const childSection = section.children.find((c) => c.slug === pageSlug);
      if (childSection) {
        breadcrumbs.push({
          title: childSection.title,
          href: `/docs/${sectionSlug}/${pageSlug}`,
        });
      }
    }
  }

  return breadcrumbs;
}
