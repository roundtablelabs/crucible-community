"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { LEGAL_PAGES } from "@/lib/legal";

type PolicyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "terms" | "privacy";
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function PolicyModal({ open, onOpenChange, type }: PolicyModalProps) {
  const page = LEGAL_PAGES[type];

  if (!page) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-navy-900/70 backdrop-blur-sm" />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-10">
          <Dialog.Content className="relative flex max-h-[90vh] w-full max-w-[calc(100vw-2rem)] sm:max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200/20 bg-[rgba(8,20,36,0.85)] shadow-[0_35px_110px_rgba(3,8,22,0.65)] backdrop-blur focus:outline-none">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200/20 p-6">
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.32em] text-gold-500">Legal</span>
                <Dialog.Title className="text-2xl font-semibold text-base-text">{page.title}</Dialog.Title>
                {page.intro && (
                  <p className="mt-2 text-sm leading-relaxed text-base-subtext">{page.intro}</p>
                )}
                <div className="flex flex-wrap gap-4 text-xs text-base-subtext">
                  <span>Last updated {formatDate(page.updated)}</span>
                  {page.previousUpdated && (
                    <span>Previous version {formatDate(page.previousUpdated)}</span>
                  )}
                </div>
              </div>
              <Dialog.Close
                className="flex items-center justify-center rounded-full border border-slate-200/20 p-2 text-base-subtext transition hover:border-slate-200/40 hover:text-base-text min-h-[44px] min-w-[44px]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-12">
                {page.sections.map((section) => {
                  const sectionId = slugify(section.heading);
                  return (
                    <section
                      key={section.heading}
                      id={sectionId}
                      className="scroll-mt-28 space-y-4 border-l border-base-divider/70 pl-6"
                    >
                      <h2 className="text-xl font-semibold text-base-text">{section.heading}</h2>
                      {section.body.map((paragraph, index) => (
                        <p
                          key={index}
                          className="text-sm leading-relaxed text-base-subtext"
                          dangerouslySetInnerHTML={{ __html: paragraph }}
                        />
                      ))}
                      {section.bullets && (
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-base-subtext/90">
                          {section.bullets.map((item, index) => {
                            // Check if item is a sub-bullet (starts with spaces)
                            const isSubBullet = item.startsWith("  ");
                            const content = isSubBullet ? item.trim() : item;
                            
                            if (isSubBullet) {
                              return (
                                <li key={index} className="ml-6 list-disc">
                                  {content}
                                </li>
                              );
                            }
                            return <li key={index}>{content}</li>;
                          })}
                        </ul>
                      )}
                      {section.endline?.map((paragraph, index) => (
                        <p
                          key={index}
                          className="text-sm leading-relaxed text-base-subtext"
                          dangerouslySetInnerHTML={{ __html: paragraph }}
                        />
                      ))}
                      {section.links && (
                        <div className="flex flex-wrap gap-3 pt-1 text-sm">
                          {section.links.map((link) => (
                            <a
                              key={link.href}
                              href={link.href}
                              target={link.href.startsWith("http") ? "_blank" : undefined}
                              rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                              className="inline-flex items-center gap-1 rounded-full border border-base-divider/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold-500 transition hover:border-gold-500/60 hover:text-gold-400"
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

