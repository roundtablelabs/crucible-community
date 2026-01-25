"use client";

import { useState } from "react";

type DownloadButtonsProps = {
  sessionId: string;
  artifactUri?: string | null;
  auditLogUri?: string | null;
};

export function DownloadButtons({ sessionId, artifactUri, auditLogUri }: DownloadButtonsProps) {
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingJson, setIsDownloadingJson] = useState(false);

  const handleDownloadPdf = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDownloadingPdf(true);
    try {
      const response = await fetch(`/api/artifacts/${sessionId}/pdf`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to download PDF:", errorText);
        alert("Failed to download PDF");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sessionId}_executive_brief.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download PDF:", error);
      alert("Failed to download PDF");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadJson = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDownloadingJson(true);
    try {
      const response = await fetch(`/api/artifacts/${sessionId}/json`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to download JSON:", errorText);
        alert("Failed to download JSON");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sessionId}_audit_log.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download JSON:", error);
      alert("Failed to download JSON");
    } finally {
      setIsDownloadingJson(false);
    }
  };

  return (
    <>
      {artifactUri && artifactUri.endsWith(".pdf") && (
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={isDownloadingPdf}
          className="rounded-full border border-base-divider px-4 py-2 font-semibold uppercase tracking-[0.28em] text-base-subtext transition hover:border-navy-900 hover:text-base-text disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDownloadingPdf ? "Downloading..." : "Download PDF"}
        </button>
      )}
      {auditLogUri && (
        <button
          type="button"
          onClick={handleDownloadJson}
          disabled={isDownloadingJson}
          className="rounded-full border border-base-divider px-4 py-2 font-semibold uppercase tracking-[0.28em] text-base-subtext transition hover:border-navy-900 hover:text-base-text disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDownloadingJson ? "Downloading..." : "Download Audit Log"}
        </button>
      )}
    </>
  );
}
