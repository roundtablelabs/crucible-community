"use client";

import { useEffect } from "react";
import { useToast } from "./ToastProvider";

const TOAST_STORAGE_KEY = "auth-error-toast";

export function ToastMessageHandler() {
  const { showToast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedToast = window.sessionStorage.getItem(TOAST_STORAGE_KEY);
      if (storedToast) {
        const toastData = JSON.parse(storedToast);
        
        // Validate toast data structure
        if (toastData && typeof toastData.title === "string") {
          showToast({
            title: toastData.title,
            description: toastData.description,
            variant: toastData.variant || "error",
          });
        }
        
        // Clean up after displaying
        window.sessionStorage.removeItem(TOAST_STORAGE_KEY);
      }
    } catch (error) {
      // Silently handle parsing errors
      if (process.env.NODE_ENV === "development") {
        console.warn("[ToastMessageHandler] Failed to parse stored toast:", error);
      }
      window.sessionStorage.removeItem(TOAST_STORAGE_KEY);
    }
  }, [showToast]);

  return null;
}
