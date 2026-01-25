/**
 * Component for FAQPage schema generation
 */

import { StructuredData } from "./StructuredData";
import { generateFAQPageSchema } from "@/lib/schema";

interface FAQItem {
  question: string;
  answer: string | React.ReactNode;
}

interface FAQSchemaProps {
  items: FAQItem[];
}

/**
 * Convert React nodes to plain text for schema
 */
function extractText(node: React.ReactNode): string {
  if (typeof node === "string") {
    return node;
  }
  if (typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join(" ");
  }
  if (node && typeof node === "object" && "props" in node) {
    const nodeWithProps = node as { props?: { children?: React.ReactNode } };
    if (nodeWithProps.props?.children) {
      return extractText(nodeWithProps.props.children);
    }
  }
  return "";
}

export function FAQSchema({ items }: FAQSchemaProps) {
  const questions = items.map((item) => ({
    question: item.question,
    answer: typeof item.answer === "string" ? item.answer : extractText(item.answer),
  }));

  const schema = generateFAQPageSchema(questions);

  return <StructuredData schema={schema} />;
}

