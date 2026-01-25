"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  FileText,
  FileDown,
  Eye,
  RefreshCw,
  Search,
  Download,
  Calendar,
  HardDrive,
} from "lucide-react";
import { FaFilePdf } from "react-icons/fa";
import { motion } from "framer-motion";

import { useAuth } from "@/components/providers/AuthProvider";
import { GlassCard } from "@/components/ui/glass-card";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { useToast } from "@/components/common/ToastProvider";
import { cn } from "@/lib/utils";

interface FileInfo {
  name: string;
  size: number;
  modified: string;
  type: "json" | "pdf" | "other";
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FileExplorerPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const filesQuery = useQuery({
    queryKey: ["artifact-files"],
    queryFn: async () => {
      const response = await fetch("/api/artifacts/files/list", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to load files");
      }

      const data = await response.json();
      return data.files as FileInfo[];
    },
    enabled: true,
  });

  const handleDownload = async (filename: string) => {
    try {
      const url = `/api/artifacts/files/${encodeURIComponent(filename)}`;
      const response = await fetch(url, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to download file");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      showToast({
        title: "File downloaded successfully",
        variant: "success",
      });
    } catch (error) {
      showToast({
        title: "Failed to download file",
        variant: "error",
      });
    }
  };

  const handleView = (filename: string, type: string) => {
    const url = `/api/artifacts/files/${encodeURIComponent(filename)}`;
    window.open(url, "_blank");
  };

  const filteredFiles = filesQuery.data?.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="container-box py-6">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-base-text mb-2 flex items-center gap-3">
              <HardDrive className="w-8 h-8 text-accent-gold" />
              File Explorer
            </h1>
            <p className="text-muted-text">
              Browse and manage files in the artifacts volume
            </p>
          </div>
          <button
            onClick={() => filesQuery.refetch()}
            disabled={filesQuery.isFetching}
            className="px-4 py-2 bg-accent-gold/10 hover:bg-accent-gold/20 text-accent-gold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw
              className={cn(
                "w-4 h-4",
                filesQuery.isFetching && "animate-spin"
              )}
            />
            Refresh
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-text" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-glass-bg border border-glass-border rounded-lg text-base-text placeholder-muted-text focus:outline-none focus:ring-2 focus:ring-accent-gold/50"
          />
        </div>
      </motion.header>

      {/* Files List */}
      {filesQuery.isLoading && (
        <div className="flex justify-center py-12">
          <InlineLoading />
        </div>
      )}

      {filesQuery.isError && (
        <GlassCard className="p-8 text-center">
          <p className="text-error-text">
            Failed to load files. Please try again.
          </p>
        </GlassCard>
      )}

      {filesQuery.isSuccess && (
        <>
          {filteredFiles.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <FileText className="w-12 h-12 text-muted-text mx-auto mb-4" />
              <p className="text-muted-text">
                {searchQuery
                  ? "No files match your search"
                  : "No files found in artifacts directory"}
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-text mb-4">
                Showing {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}
              </div>

              {filteredFiles.map((file, index) => (
                <motion.div
                  key={file.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <GlassCard className="p-6 hover:bg-glass-hover transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* File Icon */}
                        <div className="flex-shrink-0">
                          {file.type === "pdf" ? (
                            <FaFilePdf className="w-8 h-8 text-red-500" />
                          ) : file.type === "json" ? (
                            <FileText className="w-8 h-8 text-yellow-500" />
                          ) : (
                            <FileText className="w-8 h-8 text-muted-text" />
                          )}
                        </div>

                        {/* File Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-base-text truncate mb-1">
                            {file.name}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-muted-text">
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-4 h-4" />
                              {formatFileSize(file.size)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(file.modified)}
                            </span>
                            <span className="px-2 py-0.5 bg-accent-gold/10 text-accent-gold rounded text-xs uppercase">
                              {file.type}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        {(file.type === "json" || file.type === "pdf") && (
                          <button
                            onClick={() => handleView(file.name, file.type)}
                            className="px-4 py-2 bg-glass-bg hover:bg-glass-hover border border-glass-border rounded-lg transition-colors flex items-center gap-2 text-base-text"
                            title="View file"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(file.name)}
                          className="px-4 py-2 bg-accent-gold/10 hover:bg-accent-gold/20 text-accent-gold rounded-lg transition-colors flex items-center gap-2"
                          title="Download file"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
