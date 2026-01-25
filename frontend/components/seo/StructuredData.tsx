/**
 * Reusable component for adding JSON-LD structured data to pages
 */

interface StructuredDataProps {
  schema: object;
}

export function StructuredData({ schema }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

