/**
 * JSON-LD Schema generation utilities for GEO (Generative Engine Optimization)
 * These schemas help LLMs understand and recommend Crucible AI Braintrust
 */

export interface OrganizationSchema {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  legalName?: string;
  url: string;
  logo?: string;
  description: string;
  sameAs?: string[];
  contactPoint?: {
    "@type": "ContactPoint";
    email?: string;
    contactType?: string;
  };
}

export interface FAQPageSchema {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: {
      "@type": "Answer";
      text: string;
    };
  }>;
}


/**
 * Generate Organization schema
 */
export function generateOrganizationSchema(data: {
  name: string;
  legalName?: string;
  url: string;
  logo?: string;
  description: string;
  sameAs?: string[];
  email?: string;
}): OrganizationSchema {
  const schema: OrganizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: data.name,
    url: data.url,
    description: data.description,
  };

  if (data.legalName) {
    schema.legalName = data.legalName;
  }

  if (data.logo) {
    schema.logo = data.logo;
  }

  if (data.sameAs && data.sameAs.length > 0) {
    schema.sameAs = data.sameAs;
  }

  if (data.email) {
    schema.contactPoint = {
      "@type": "ContactPoint",
      email: data.email,
      contactType: "Customer Service",
    };
  }

  return schema;
}

/**
 * Generate FAQPage schema
 */
export function generateFAQPageSchema(
  questions: Array<{ question: string; answer: string }>
): FAQPageSchema {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };
}



