"use client";

import Link from "next/link";
import Lottie from "lottie-react";

import animationData from "@/public/animations/error-404.json";

export default function NotFound() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center"
      style={{ background: "var(--rt-bg)", color: "var(--rt-text)" }}
    >
      <div
        className="w-full max-w-3xl space-y-8 rounded-[32px] border p-10"
        style={{
          background: "var(--rt-panel-elevated)",
          borderColor: "var(--rt-border-strong)",
          boxShadow: "var(--rt-shadow-elevated)",
        }}
      >
        <div className="mx-auto max-w-md">
          <Lottie
            animationData={animationData}
            loop
            autoplay
            className="mx-auto h-64 w-64"
            aria-hidden="true"
          />
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--rt-muted)]">404 · Off agenda</p>
          <h1 className="text-3xl font-semibold leading-tight text-[color:var(--rt-text)]">
            We couldn&apos;t find that boardroom
          </h1>
          <p className="text-[15px] text-[color:var(--rt-subtext)]">
            The link you followed may be archived or private. Rejoin the Launchpad to start a new session,
            or jump back to the Boardroom overview.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/app/launchpad"
            className="inline-flex items-center justify-center rounded-full border px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em]"
            style={{
              borderColor: "var(--rt-accent-700)",
              color: "var(--rt-accent-600)",
              background: "var(--rt-accent-100)",
            }}
          >
            Go to Launchpad
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center justify-center rounded-full border px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em]"
            style={{ borderColor: "var(--rt-border)", color: "var(--rt-text)" }}
          >
            Back to dashboard
          </Link>
        </div>

        <p className="text-xs text-[color:var(--rt-muted)]">
          Need help?{" "}
          <a
            href="mailto:support@roundtable.ai"
            className="font-semibold text-[color:var(--rt-accent-600)] underline-offset-4 hover:underline"
          >
            Contact support
          </a>{" "}
          and we&apos;ll get you back on track.
        </p>
      </div>
    </main>
  );
}

