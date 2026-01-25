/**
 * useDocumentUpload hook
 * Manages document upload state, preview, and confirmation
 * 
 * SECURITY NOTE: This hook uses ensureJWTToken() before XMLHttpRequest calls.
 * This is REQUIRED - the token from useAuth() may be a UUID that needs to be
 * exchanged for a JWT before making backend API calls.
 */

import { useCallback, useState, useRef } from "react";
import { checkRateLimitStatus } from "@/lib/api/rate-limit";
import { needsCaptcha } from "@/lib/turnstile/client";
import { logError, getActionableErrorMessage } from "@/lib/utils/errorHandler";
import { calculateUploadProgress } from "@/lib/utils/loadingHelpers";
import type { PreviewData, UploadRateLimitError } from "../types";

type UseDocumentUploadOptions = {
  token: string | null | undefined;
  user: { id: string } | null | undefined;
  executeTurnstile: (action: string) => Promise<string | null>;
  requireAuth: (intent?: { reason: string }) => Promise<any>;
};

type UseDocumentUploadReturn = {
  // State
  uploading: boolean;
  uploadProgress: number;
  uploadStartTime: number | null;
  uploadError: string | null;
  setUploadError: React.Dispatch<React.SetStateAction<string | null>>;
  uploadRateLimitError: UploadRateLimitError | null;
  setUploadRateLimitError: React.Dispatch<React.SetStateAction<UploadRateLimitError | null>>;
  pendingFile: File | null;
  setPendingFile: React.Dispatch<React.SetStateAction<File | null>>;
  previewData: PreviewData | null;
  setPreviewData: React.Dispatch<React.SetStateAction<PreviewData | null>>;
  showUploadConfirm: boolean;
  setShowUploadConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  showReplaceUploadModal: boolean;
  setShowReplaceUploadModal: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Refs
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  pendingUploadReplaceAction: React.MutableRefObject<(() => void) | null>;
  
  // Actions
  handleFilePreview: (file: File, hasExistingState: boolean) => Promise<void>;
  handleUploadConfirm: (onSuccess: (summary: string) => void) => Promise<void>;
  handleUploadCancel: () => void;
  handleUploadReplaceConfirm: (onConfirm: () => void) => void;
  handleUploadReplaceCancel: () => void;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>, hasExistingState: boolean) => void;
  handleUploadButtonClick: () => Promise<void>;
  resetUploadState: () => void;
};

export function useDocumentUpload({
  token,
  user,
  executeTurnstile,
  requireAuth,
}: UseDocumentUploadOptions): UseDocumentUploadReturn {
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadRateLimitError, setUploadRateLimitError] = useState<UploadRateLimitError | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [showReplaceUploadModal, setShowReplaceUploadModal] = useState(false);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadReplaceAction = useRef<(() => void) | null>(null);

  /**
   * Preview file before upload
   * 
   * SECURITY: Uses ensureJWTToken() to exchange UUID for JWT before making API call.
   * This is REQUIRED per AUTHENTICATION_TOKEN_HANDLING.md
   */
  const handleFilePreview = useCallback(
    async (file: File, hasExistingState: boolean) => {
      // Require authentication before uploading
      if (!token) {
        setUploadError("Please sign in to upload documents");
        await requireAuth({ reason: "Sign in to upload documents" });
        return;
      }

      setUploading(true);
      setUploadError(null);
      setUploadProgress(0);
      setUploadStartTime(Date.now());
      
      try {
        // SECURITY: Ensure we have a JWT token (exchange UUID if needed)
        const { ensureJWTToken } = await import("@/lib/auth/client-token");
        const jwtToken = await ensureJWTToken(token);
        
        if (!jwtToken) {
          setUploadError("Failed to authenticate. Please try signing in again.");
          setUploading(false);
          return;
        }

        // 1. Check rate limit status FIRST
        const rateLimitStatus = await checkRateLimitStatus("upload", jwtToken);
        
        // 2. Determine if CAPTCHA needed
        const captchaNeeded = needsCaptcha(user ?? null, rateLimitStatus);
        
        // 3. Execute Turnstile if needed
        let turnstileToken: string | null = null;
        let turnstileError: string | null = null;
        if (captchaNeeded) {
          try {
            turnstileToken = await executeTurnstile("upload");
            if (!turnstileToken) {
              turnstileError = "Security verification timed out or failed";
              console.error("[upload] Turnstile token generation failed");
              
              // In development mode, allow upload to proceed without CAPTCHA if Turnstile fails
              // Backend will also allow this in dev mode
              if (process.env.NODE_ENV === "development") {
                console.warn("[upload] Turnstile token generation failed, proceeding without CAPTCHA in dev mode");
                // Continue without token - backend will allow in dev mode
              } else {
                // In production, show user-friendly error with retry option
                setUploadError(
                  "Security verification failed. This may be due to network issues or browser extensions. " +
                  "Please try refreshing the page or disabling ad blockers, then try again."
                );
                setUploading(false);
                return;
              }
            }
          } catch (error) {
            turnstileError = error instanceof Error ? error.message : "Unknown Turnstile error";
            console.error("[upload] Turnstile execution error:", error);
            
            if (process.env.NODE_ENV === "development") {
              console.warn("[upload] Turnstile error, proceeding without CAPTCHA in dev mode");
              // Continue without token in dev mode
            } else {
              setUploadError(
                `Security verification error: ${turnstileError}. Please refresh the page and try again.`
              );
              setUploading(false);
              return;
            }
          }
        }
        
        const formData = new FormData();
        formData.append("file", file);

        // SECURITY: Use JWT token (not raw token) in Authorization header
        const headers: HeadersInit = {
          Authorization: `Bearer ${jwtToken}`,
          ...(turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {}),
        };

        // Use XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        const response = await new Promise<Response>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const progress = calculateUploadProgress(e.loaded, e.total);
              setUploadProgress(progress);
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: new Headers(),
              }));
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Network error"));
          });

          xhr.open("POST", "/api/intake/upload/preview");
          Object.entries(headers).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
          });
          xhr.send(formData);
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as { 
            error?: string; 
            detail?: string;
            message?: string;
            limit?: number;
            remaining?: number;
            reset_at?: number;
            retry_after?: number;
          };
          
          // Handle rate limit errors (429)
          if (response.status === 429) {
            const rateLimitError: UploadRateLimitError = {
              error: errorBody.error || errorBody.message || errorBody.detail || "Rate limit exceeded",
              limit: errorBody.limit ?? 5,
              remaining: errorBody.remaining ?? 0,
              resetAt: errorBody.reset_at ?? Math.floor(Date.now() / 1000) + 3600,
              retryAfter: errorBody.retry_after ?? 3600,
            };
            setUploadRateLimitError(rateLimitError);
            setUploadError(null); // Clear generic error
            setUploading(false);
            return;
          }
          
          // Handle authentication errors
          if (response.status === 401 || response.status === 403) {
            setUploadError("Please sign in to upload documents");
            setUploadRateLimitError(null);
            await requireAuth({ reason: "Sign in to upload documents" });
            return;
          }
          
          const errorMessage = errorBody.error || errorBody.detail || errorBody.message || "Failed to preview document";
          setUploadRateLimitError(null); // Clear rate limit error for other errors
          throw new Error(errorMessage);
        }

        const data = JSON.parse(xhr.responseText) as {
          extracted_text_preview: string;
          file_name: string;
          file_size: number;
          word_count: number;
          character_count: number;
        };
        
        setUploadProgress(100);
        // Store file and preview data
        setPendingFile(file);
        setPreviewData({
          fileName: data.file_name,
          fileSize: data.file_size,
          extractedTextPreview: data.extracted_text_preview,
        });
        
        if (hasExistingState) {
          // Store action to proceed with upload confirmation after replacement is confirmed
          pendingUploadReplaceAction.current = () => {
            setShowUploadConfirm(true);
          };
          // Show replacement confirmation dialog
          setShowReplaceUploadModal(true);
        } else {
          // Show normal upload confirmation dialog
          setShowUploadConfirm(true);
        }
        // Clear any previous errors on success
        setUploadError(null);
      } catch (error) {
        logError(error, "useDocumentUpload: handleFilePreview");
        const actionableError = getActionableErrorMessage(error);
        setUploadError(actionableError.message);
        setUploadRateLimitError(null); // Clear rate limit error on generic errors
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setUploadStartTime(null);
      }
    },
    [token, requireAuth, user, executeTurnstile]
  );

  /**
   * Confirm upload and process document
   * 
   * SECURITY: Uses ensureJWTToken() to exchange UUID for JWT before making API call.
   * This is REQUIRED per AUTHENTICATION_TOKEN_HANDLING.md
   */
  const handleUploadConfirm = useCallback(
    async (onSuccess: (summary: string) => void) => {
      if (!pendingFile) {
        return;
      }

      // Require authentication before uploading
      if (!token) {
        setUploadError("Please sign in to upload documents");
        await requireAuth({ reason: "Sign in to upload documents" });
        return;
      }

      setUploading(true);
      setShowUploadConfirm(false);
      setUploadError(null);
      setUploadProgress(0);
      setUploadStartTime(Date.now());
      
      try {
        // SECURITY: Ensure we have a JWT token (exchange UUID if needed)
        const { ensureJWTToken } = await import("@/lib/auth/client-token");
        const jwtToken = await ensureJWTToken(token);
        
        if (!jwtToken) {
          setUploadError("Failed to authenticate. Please try signing in again.");
          setUploading(false);
          return;
        }

        // 1. Check rate limit status FIRST
        const rateLimitStatus = await checkRateLimitStatus("upload", jwtToken);
        
        // 2. Determine if CAPTCHA needed
        const captchaNeeded = needsCaptcha(user ?? null, rateLimitStatus);
        
        // 3. Execute Turnstile if needed
        let turnstileToken: string | null = null;
        let turnstileError: string | null = null;
        if (captchaNeeded) {
          try {
            turnstileToken = await executeTurnstile("upload");
            if (!turnstileToken) {
              turnstileError = "Security verification timed out or failed";
              console.error("[upload] Turnstile token generation failed");
              
              // In development mode, allow upload to proceed without CAPTCHA if Turnstile fails
              // Backend will also allow this in dev mode
              if (process.env.NODE_ENV === "development") {
                console.warn("[upload] Turnstile token generation failed, proceeding without CAPTCHA in dev mode");
                // Continue without token - backend will allow in dev mode
              } else {
                // In production, show user-friendly error with retry option
                setUploadError(
                  "Security verification failed. This may be due to network issues, browser extensions, or rate limiting. " +
                  "Please try refreshing the page, disabling ad blockers, or wait a moment and try again."
                );
                setUploadRateLimitError(null); // Clear rate limit error if Turnstile fails
                setUploading(false);
                return;
              }
            }
          } catch (error) {
            turnstileError = error instanceof Error ? error.message : "Unknown Turnstile error";
            console.error("[upload] Turnstile execution error:", error);
            
            // Extract more specific error information
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            const isTimeout = errorMessage.toLowerCase().includes("timeout");
            const isWidgetError = errorMessage.toLowerCase().includes("widget");
            
            if (process.env.NODE_ENV === "development") {
              console.warn("[upload] Turnstile error, proceeding without CAPTCHA in dev mode");
              // Continue without token in dev mode
            } else {
              let userMessage = "Security verification failed. ";
              if (isTimeout) {
                userMessage += "The verification timed out. This may happen when rate limits are reached. ";
              } else if (isWidgetError) {
                userMessage += "The security widget failed to load. ";
              }
              userMessage += "Please refresh the page and try again. If the problem persists, try disabling browser extensions or wait a few minutes.";
              
              setUploadError(userMessage);
              setUploadRateLimitError(null); // Clear rate limit error if Turnstile fails
              setUploading(false);
              return;
            }
          }
        }
        
        const formData = new FormData();
        formData.append("file", pendingFile);

        // SECURITY: Use JWT token (not raw token) in Authorization header
        const headers: HeadersInit = {
          Authorization: `Bearer ${jwtToken}`,
          ...(turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {}),
        };

        // Use XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        const response = await new Promise<Response>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const progress = calculateUploadProgress(e.loaded, e.total);
              setUploadProgress(progress);
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: new Headers(),
              }));
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Network error"));
          });

          xhr.open("POST", "/api/intake/upload");
          Object.entries(headers).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
          });
          xhr.send(formData);
        });

        if (!response.ok) {
          const errorBody = JSON.parse(xhr.responseText || "{}") as { 
            error?: string; 
            detail?: string;
            message?: string;
            limit?: number;
            remaining?: number;
            reset_at?: number;
            retry_after?: number;
          };
          
          // Handle rate limit errors (429)
          if (response.status === 429) {
            const rateLimitError: UploadRateLimitError = {
              error: errorBody.error || errorBody.message || errorBody.detail || "Rate limit exceeded",
              limit: errorBody.limit ?? 5,
              remaining: errorBody.remaining ?? 0,
              resetAt: errorBody.reset_at ?? Math.floor(Date.now() / 1000) + 3600,
              retryAfter: errorBody.retry_after ?? 3600,
            };
            setUploadRateLimitError(rateLimitError);
            setUploadError(null); // Clear generic error
            setUploading(false);
            return;
          }
          
          // Handle authentication errors
          if (response.status === 401 || response.status === 403) {
            setUploadError("Please sign in to upload documents");
            setUploadRateLimitError(null);
            await requireAuth({ reason: "Sign in to upload documents" });
            return;
          }
          
          const errorMessage = errorBody.error || errorBody.detail || errorBody.message || "Failed to upload document";
          setUploadRateLimitError(null); // Clear rate limit error for other errors
          throw new Error(errorMessage);
        }

        const data = JSON.parse(xhr.responseText) as { summary: string; done: boolean };
        
        if (data.summary) {
          setUploadProgress(100);
          onSuccess(data.summary);
        } else {
          throw new Error("No summary generated from document");
        }
      } catch (error) {
        logError(error, "useDocumentUpload: handleUploadConfirm");
        const actionableError = getActionableErrorMessage(error);
        setUploadError(actionableError.message);
        setUploadRateLimitError(null); // Clear rate limit error on generic errors
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setUploadStartTime(null);
        setPendingFile(null);
        setPreviewData(null);
      }
    },
    [pendingFile, token, requireAuth, user, executeTurnstile]
  );

  /**
   * Cancel upload
   */
  const handleUploadCancel = useCallback(() => {
    setShowUploadConfirm(false);
    setPendingFile(null);
    setPreviewData(null);
    setUploadError(null);
    setUploadRateLimitError(null);
  }, []);

  /**
   * Confirm replacement of existing state with upload
   */
  const handleUploadReplaceConfirm = useCallback((onConfirm: () => void) => {
    setShowReplaceUploadModal(false);
    const action = pendingUploadReplaceAction.current;
    pendingUploadReplaceAction.current = null;
    
    // Call the onConfirm callback to reset state
    onConfirm();
    
    // Proceed with upload confirmation
    if (action) {
      action();
    } else {
      setShowUploadConfirm(true);
    }
  }, []);

  /**
   * Cancel replacement
   */
  const handleUploadReplaceCancel = useCallback(() => {
    pendingUploadReplaceAction.current = null;
    setShowReplaceUploadModal(false);
    setPendingFile(null);
    setPreviewData(null);
    setUploadError(null);
    setUploadRateLimitError(null);
  }, []);

  /**
   * Handle file input change
   */
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>, hasExistingState: boolean) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleFilePreview(file, hasExistingState);
      }
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFilePreview]
  );

  /**
   * Handle upload button click
   */
  const handleUploadButtonClick = useCallback(async () => {
    // Require authentication before allowing document upload
    await requireAuth({ reason: "Sign in to upload documents" });
    fileInputRef.current?.click();
  }, [requireAuth]);

  /**
   * Reset all upload state
   */
  const resetUploadState = useCallback(() => {
    setUploading(false);
    setUploadProgress(0);
    setUploadStartTime(null);
    setUploadError(null);
    setUploadRateLimitError(null);
    setPendingFile(null);
    setPreviewData(null);
    setShowUploadConfirm(false);
    setShowReplaceUploadModal(false);
    pendingUploadReplaceAction.current = null;
  }, []);

  return {
    // State
    uploading,
    uploadProgress,
    uploadStartTime,
    uploadError,
    setUploadError,
    uploadRateLimitError,
    setUploadRateLimitError,
    pendingFile,
    setPendingFile,
    previewData,
    setPreviewData,
    showUploadConfirm,
    setShowUploadConfirm,
    showReplaceUploadModal,
    setShowReplaceUploadModal,
    
    // Refs
    fileInputRef,
    pendingUploadReplaceAction,
    
    // Actions
    handleFilePreview,
    handleUploadConfirm,
    handleUploadCancel,
    handleUploadReplaceConfirm,
    handleUploadReplaceCancel,
    handleFileSelect,
    handleUploadButtonClick,
    resetUploadState,
  };
}

