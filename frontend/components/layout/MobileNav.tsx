"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NAV_LINKS } from "@/lib/constants";
import { getAppUrl } from "@/lib/utils";

export function MobileNav() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex items-center justify-center rounded-full border border-base-divider p-2 text-base-subtext transition hover:border-navy-900 hover:text-base-text md:hidden">
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open navigation</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-navy-900/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col gap-6 rounded-l-3xl border-l border-base-divider bg-base-panel p-6 shadow-elevated">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold uppercase tracking-[0.3em] text-base-subtext">
              Menu
            </Dialog.Title>
            <Dialog.Close className="rounded-full border border-base-divider p-2 text-base-subtext transition hover:border-navy-900 hover:text-base-text">
              <X className="h-4 w-4" />
              <span className="sr-only">Close navigation</span>
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-3 text-sm font-medium text-base-text">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="rounded-2xl border border-base-divider px-4 py-3 transition hover:border-navy-900 hover:bg-steel-100"
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
              >
                {item.name}
              </Link>
            ))}
          </div>
          <div className="mt-auto space-y-3">
            <a
              href={getAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-full border border-gold-500/70 bg-navy-900 px-4 py-2 text-sm font-semibold text-base-panel shadow-sm transition hover:bg-navy-800"
            >
              Enter the Crucible
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

