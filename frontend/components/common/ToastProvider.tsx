"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastVariant = "info" | "success" | "error";

type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number; // Optional custom duration in ms (default: 5000ms)
  dismissible?: boolean; // Default: true
};

type ToastInternal = ToastOptions & {
  id: number;
  variant: ToastVariant;
  duration: number;
  dismissible: boolean;
};

type ToastContextValue = {
  showToast: (options: ToastOptions) => void;
  dismissToast: (id: number) => void;
  dismissAllToasts: () => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: "border-info-700/60 bg-info-100/80 text-info-700",
  success: "border-success-700/60 bg-success-100/80 text-success-700",
  error: "border-danger-700/60 bg-danger-100/80 text-danger-700",
};

const ARIA_ROLES: Record<ToastVariant, "status" | "alert"> = {
  info: "status",
  success: "status",
  error: "alert",
};

const ARIA_LIVE: Record<ToastVariant, "polite" | "assertive"> = {
  info: "polite",
  success: "polite",
  error: "assertive",
};

const MAX_VISIBLE_TOASTS = 5;
const DEFAULT_DURATION = 5000; // 5 seconds

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastInternal[]>([]);
  const timeoutRefs = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const dismissToast = useCallback((id: number) => {
    // Clear timeout if exists
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const dismissAllToasts = useCallback(() => {
    // Clear all timeouts
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current.clear();
    setToasts([]);
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    const id = Date.now() + Math.random(); // Ensure unique ID
    const variant = options.variant ?? "info";
    const duration = options.duration ?? DEFAULT_DURATION;
    const dismissible = options.dismissible ?? true;

    const newToast: ToastInternal = {
      ...options,
      variant,
      duration,
      dismissible,
      id,
    };

    setToasts((prev) => {
      // Limit visible toasts
      const updated = [...prev, newToast];
      return updated.slice(-MAX_VISIBLE_TOASTS);
    });

    // Auto-dismiss after duration (if dismissible and duration > 0)
    if (dismissible && duration > 0) {
      const timeout = setTimeout(() => {
        dismissToast(id);
      }, duration);
      timeoutRefs.current.set(id, timeout);
    }
  }, [dismissToast]);

  // Keyboard support: Escape key dismisses all toasts
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && toasts.length > 0) {
        dismissAllToasts();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [toasts.length, dismissAllToasts]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ showToast, dismissToast, dismissAllToasts }),
    [showToast, dismissToast, dismissAllToasts],
  );

  // Limit visible toasts for rendering
  const visibleToasts = toasts.slice(-MAX_VISIBLE_TOASTS);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* ARIA live region for screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {toasts.length > 0 && (
          <div>
            {toasts.map((toast) => (
              <div key={toast.id}>
                {toast.variant === "error" ? "Error: " : ""}
                {toast.title}
                {toast.description ? ` - ${toast.description}` : ""}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Toast container - positioned top-right to avoid help button */}
      <div
        className="fixed top-6 right-6 z-[100] flex w-[min(320px,90vw)] flex-col gap-3 pointer-events-none"
        aria-label="Notifications"
      >
        <AnimatePresence mode="popLayout">
          {visibleToasts.map((toast, index) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{
                duration: 0.2,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={cn(
                "pointer-events-auto rounded-2xl border px-4 py-3 shadow-soft relative",
                VARIANT_STYLES[toast.variant],
              )}
              role={ARIA_ROLES[toast.variant]}
              aria-live={ARIA_LIVE[toast.variant]}
              aria-atomic="true"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{toast.title}</div>
                  {toast.description ? (
                    <p className="mt-1 text-xs text-base-subtext">{toast.description}</p>
                  ) : null}
                </div>
                {toast.dismissible && (
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    aria-label={`Dismiss notification: ${toast.title}`}
                    className={cn(
                      "flex-shrink-0 rounded-full p-1 transition-colors",
                      "hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-offset-2",
                      toast.variant === "error"
                        ? "text-danger-700 hover:text-danger-800 focus:ring-danger-500/50"
                        : toast.variant === "success"
                          ? "text-success-700 hover:text-success-800 focus:ring-success-500/50"
                          : "text-info-700 hover:text-info-800 focus:ring-info-500/50",
                    )}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
