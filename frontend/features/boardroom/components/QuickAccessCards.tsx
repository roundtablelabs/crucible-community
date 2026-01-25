"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

type QuickAccessCardsProps = {
  // No props needed - component is self-contained
};

export function QuickAccessCards({}: QuickAccessCardsProps) {

  const [faqOpen, setFaqOpen] = useState(false);
  const faqContentRef = useRef<HTMLDivElement>(null);
  const [faqHeight, setFaqHeight] = useState(0);

  useEffect(() => {
    if (faqContentRef.current) {
      if (faqOpen) {
        setFaqHeight(faqContentRef.current.scrollHeight);
      } else {
        setFaqHeight(0);
      }
    }
  }, [faqOpen]);

  // Always show "How do I start?" FAQ
  const faqItems = [
    {
      question: "How do I start?",
      answer: (
        <>
          <p className="mb-3">You have three ways to begin your strategic briefing:</p>
          <ul className="space-y-2 list-disc list-inside mb-3">
            <li><strong>Click Here to Start</strong> - Begin a conversation with the intake assistant. Best for exploring ideas or when you need guidance.</li>
            <li><strong>Upload Document</strong> - Upload a PDF, Word doc, or text file with your strategic question and context. Best when you already have a document prepared.</li>
            <li><strong>Board-Level Question Builder</strong> - Use the guided form to structure your question with all key details upfront. Best for complex decisions requiring structured input.</li>
          </ul>
          <p className="text-xs text-gold-100/70">All methods lead to the same outcome: a comprehensive brief ready for your AI Council debate.</p>
        </>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-1 lg:items-start">
        {/* FAQ Card - Full Width */}
        <div className="flex">
          <div className="w-full">
            <GlassCard 
              variant="elevated" 
              className={cn(
                "overflow-hidden transition hover:border-gold-500/40",
                faqOpen && "border-gold-500/40"
              )}
            >
              <button
                onClick={() => setFaqOpen(!faqOpen)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-4 text-left"
                aria-expanded={faqOpen}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gold-500/30 bg-[radial-gradient(circle_at_center,_rgba(242,194,79,0.15)_0%,_rgba(15,23,36,0.85)_70%)]">
                    <HelpCircle className="h-5 w-5 text-white" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white transition">
                      How do I start?
                    </h3>
                    <p className="text-xs text-gold-100/60 mt-0.5">
                      Ways to begin
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-base-subtext transition-transform duration-300",
                    faqOpen && "rotate-180"
                  )}
                  aria-hidden="true"
                />
              </button>
              <div
                ref={faqContentRef}
                style={{
                  maxHeight: `${faqHeight}px`,
                  transition: "max-height 0.3s ease-in-out, opacity 0.3s ease-in-out",
                  opacity: faqOpen ? 1 : 0,
                }}
                className="overflow-hidden"
              >
                <div className="border-t border-base-divider/60 px-4 py-4 space-y-4">
                  {faqItems.map((item, index) => (
                    <div key={index} className="space-y-2">
                      <h4 className="text-xs font-semibold text-white">{item.question}</h4>
                      {typeof item.answer === 'string' ? (
                        <p className="text-xs leading-relaxed text-gold-100/60">{item.answer}</p>
                      ) : (
                        <div className="text-xs leading-relaxed text-gold-100/60">{item.answer}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}

