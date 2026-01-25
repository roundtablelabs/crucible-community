/**
 * useIntakeChat hook
 * Manages intake chat state, API calls, and rate limit handling
 * 
 * SECURITY NOTE: This hook calls /api/intake (Next.js API route) WITHOUT
 * an Authorization header. This is intentional - the server-side route
 * uses session cookies and getAuthToken(). Do NOT add Authorization header.
 */

import React, { useCallback, useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { checkRateLimitStatus } from "@/lib/api/rate-limit";
import { needsCaptcha } from "@/lib/turnstile/client";
import { logError, getActionableErrorMessage } from "@/lib/utils/errorHandler";
import type { IntakeChatMessage, IntakeAssistantResponse, IntakeRateLimitError, LaunchpadTransferCache } from "../types";
import { generateId } from "../constants";

type UseIntakeChatOptions = {
  token: string | null | undefined;
  user: { id: string } | null | undefined;
  executeTurnstile: (action: string) => Promise<string | null>;
  // Optional dependencies for handleChatSubmit
  transferToLaunchpad?: (data: LaunchpadTransferCache) => void;
  skipWarning?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
};

type UseIntakeChatReturn = {
  // State
  chatMessages: IntakeChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<IntakeChatMessage[]>>;
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  chatLoading: boolean;
  setChatLoading: React.Dispatch<React.SetStateAction<boolean>>;
  chatError: string | null;
  setChatError: React.Dispatch<React.SetStateAction<string | null>>;
  intakeRateLimitError: IntakeRateLimitError | null;
  setIntakeRateLimitError: React.Dispatch<React.SetStateAction<IntakeRateLimitError | null>>;
  intakeSummary: string | null;
  setIntakeSummary: React.Dispatch<React.SetStateAction<string | null>>;
  
  // Refs
  hasBootstrappedChat: React.MutableRefObject<boolean>;
  
  // Actions
  invokeIntake: (history: IntakeChatMessage[]) => Promise<IntakeAssistantResponse>;
  bootstrapChat: () => Promise<void>;
  handleRetryBootstrapChat: () => Promise<void>;
  clearErrors: () => void;
  handleChatSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function useIntakeChat({
  token,
  user,
  executeTurnstile,
  transferToLaunchpad,
  skipWarning,
  textareaRef,
}: UseIntakeChatOptions): UseIntakeChatReturn {
  const router = useRouter();
  
  // Store optional dependencies in refs so they can be updated later
  const transferToLaunchpadRef = useRef(transferToLaunchpad);
  const skipWarningRef = useRef(skipWarning);
  const textareaRefRef = useRef(textareaRef);
  
  // Update refs when dependencies change
  React.useEffect(() => {
    transferToLaunchpadRef.current = transferToLaunchpad;
    skipWarningRef.current = skipWarning;
    textareaRefRef.current = textareaRef;
  }, [transferToLaunchpad, skipWarning, textareaRef]);
  
  // Chat state - starts with greeting message so it shows immediately on first render
  const [chatMessages, setChatMessages] = useState<IntakeChatMessage[]>(() => [{
    id: generateId(),
    role: "assistant",
    content: "I'm here to help you prepare a strategic decision brief for a board-level debate. What strategic decision or challenge would you like to explore?",
  }]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [intakeRateLimitError, setIntakeRateLimitError] = useState<IntakeRateLimitError | null>(null);
  const [intakeSummary, setIntakeSummary] = useState<string | null>(null);
  
  // Ref to track if chat has been bootstrapped
  const hasBootstrappedChat = useRef(false);

  /**
   * Make request to intake API
   * 
   * SECURITY: Does NOT use Authorization header - this is intentional.
   * The /api/intake route uses session cookies and getAuthToken() server-side.
   */
  const invokeIntake = useCallback(
    async (history: IntakeChatMessage[]): Promise<IntakeAssistantResponse> => {
      // 1. Check rate limit status FIRST
      const rateLimitStatus = await checkRateLimitStatus("intake", token ?? null);
      
      // 2. Determine if CAPTCHA needed
      const captchaNeeded = needsCaptcha(user ?? null, rateLimitStatus);
      
      // 3. Execute Turnstile if needed
      let turnstileToken: string | null = null;
      if (captchaNeeded) {
        turnstileToken = await executeTurnstile("intake");
        if (!turnstileToken) {
          // If widget fails, log warning but don't block the request
          // The backend will still verify if token is provided, but won't block if missing in dev
          if (process.env.NODE_ENV === "development") {
            console.warn("[turnstile] Failed to generate token, proceeding without CAPTCHA (dev mode)");
          }
          // In production, we should probably block, but for now allow to proceed
          // The backend will handle verification
        }
      }
      
      // 4. Make request with Turnstile token in headers
      // NOTE: No Authorization header - uses session cookies
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {}),
        },
        body: JSON.stringify({
          history: history.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        
        // Debug logging
        if (process.env.NODE_ENV === "development") {
          console.log("[rate-limit] Intake response status:", response.status);
          console.log("[rate-limit] Intake error body:", errorBody);
        }
        
        // Check if it's a rate limit error (429)
        if (response.status === 429 && errorBody.limit !== undefined) {
          if (process.env.NODE_ENV === "development") {
            console.log("[rate-limit] Intake rate limit error detected:", errorBody);
          }
          // Create a custom error with rate limit info
          const rateLimitError = new Error(errorBody.error || errorBody.message || "Rate limit exceeded") as Error & {
            status: number;
            rateLimitInfo: {
              limit: number;
              remaining: number;
              reset_at: number;
              retry_after: number;
            };
          };
          rateLimitError.status = 429;
          rateLimitError.rateLimitInfo = {
            limit: errorBody.limit,
            remaining: errorBody.remaining || 0,
            reset_at: errorBody.reset_at || Math.floor(Date.now() / 1000) + errorBody.retry_after,
            retry_after: errorBody.retry_after || 3600,
          };
          throw rateLimitError;
        }
        
        const message = (errorBody as { error?: string }).error ?? "Intake assistant failed.";
        throw new Error(message);
      }

      return (await response.json()) as IntakeAssistantResponse;
    },
    [token, user, executeTurnstile]
  );

  /**
   * Bootstrap the chat with initial assistant message
   * Uses a fixed greeting message instead of calling the API
   */
  const bootstrapChat = useCallback(async () => {
    if (hasBootstrappedChat.current) {
      return;
    }
    hasBootstrappedChat.current = true;
    // Use fixed greeting message - no API call needed, set immediately
    const greetingMessage = "I'm here to help you prepare a strategic decision brief for a board-level debate. What strategic decision or challenge would you like to explore?";
    setChatMessages([{ id: generateId(), role: "assistant", content: greetingMessage }]);
    setChatError(null);
    setIntakeRateLimitError(null);
  }, []);

  /**
   * Retry bootstrapping the chat after an error
   */
  const handleRetryBootstrapChat = useCallback(async () => {
    hasBootstrappedChat.current = false;
    setChatError(null);
    setIntakeRateLimitError(null);
    await bootstrapChat();
  }, [bootstrapChat]);

  /**
   * Clear all errors
   */
  const clearErrors = useCallback(() => {
    setChatError(null);
    setIntakeRateLimitError(null);
  }, []);

  /**
   * Handle chat form submission
   */
  const handleChatSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!chatInput.trim() || chatLoading) {
        return;
      }
      const trimmed = chatInput.trim();
      const userMessage: IntakeChatMessage = {
        id: generateId(),
        role: "user",
        content: trimmed,
      };
      setChatInput("");
      // Reset textarea height
      if (textareaRefRef.current?.current) {
        textareaRefRef.current.current.style.height = "auto";
      }

      const isFirstUserMessage = !chatMessages.some((message) => message.role === "user");
      if (isFirstUserMessage && transferToLaunchpadRef.current && skipWarningRef.current) {
        // This is an intentional navigation to launchpad - skip the warning
        skipWarningRef.current();
        transferToLaunchpadRef.current({
          messages: [...chatMessages, userMessage],
          summary: intakeSummary,
          autoStart: true,
        });
        router.push("/app/launchpad");
        return;
      }

      const historyForRequest = [...chatMessages, userMessage];
      setChatMessages((prev) => [...prev, userMessage]);
      setChatLoading(true);
      setChatError(null);
      setIntakeRateLimitError(null);
      try {
        const data = await invokeIntake(historyForRequest);
        if (data.summary) {
          setIntakeSummary(data.summary);
        }
        if (data.question) {
          setChatMessages((prev) => [
            ...prev,
            { id: generateId(), role: "assistant", content: data.question },
          ]);
        }
        // Clear any previous errors on success
        setChatError(null);
        setIntakeRateLimitError(null);
      } catch (error) {
        logError(error, "Boardroom: handleChatSubmit");
        
        // Check if it's a rate limit error
        if (error instanceof Error && (error as any).status === 429) {
          const rateLimitInfo = (error as any).rateLimitInfo;
          if (rateLimitInfo) {
            setIntakeRateLimitError({
              error: error.message || "Rate limit exceeded",
              limit: rateLimitInfo.limit,
              remaining: rateLimitInfo.remaining || 0,
              resetAt: rateLimitInfo.reset_at || Math.floor(Date.now() / 1000) + rateLimitInfo.retry_after,
              retryAfter: rateLimitInfo.retry_after || 3600,
            });
            setChatError(null); // Clear regular error
            return; // Don't set regular error
          }
        }
        
        const actionableError = getActionableErrorMessage(error);
        setChatError(actionableError.message);
        setIntakeRateLimitError(null); // Clear rate limit error
      } finally {
        setChatLoading(false);
      }
    },
    [chatInput, chatLoading, chatMessages, intakeSummary, invokeIntake, router]
  );

  return {
    // State
    chatMessages,
    setChatMessages,
    chatInput,
    setChatInput,
    chatLoading,
    setChatLoading,
    chatError,
    setChatError,
    intakeRateLimitError,
    setIntakeRateLimitError,
    intakeSummary,
    setIntakeSummary,
    
    // Refs
    hasBootstrappedChat,
    
    // Actions
    invokeIntake,
    bootstrapChat,
    handleRetryBootstrapChat,
    clearErrors,
    handleChatSubmit,
  };
}

