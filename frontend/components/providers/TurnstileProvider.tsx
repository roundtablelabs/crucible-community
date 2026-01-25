/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import React, { createContext, useContext, ReactNode, useCallback } from "react";

// Community Edition: No-op Turnstile provider (CAPTCHA disabled)
interface TurnstileContextValue {
  execute: (action: string) => Promise<string | null>;
  reset: () => void;
  isReady: boolean;
}

const TurnstileContext = createContext<TurnstileContextValue | null>(null);

export function useTurnstile() {
  const context = useContext(TurnstileContext);
  // During SSR or if provider is not available, return a no-op implementation
  if (!context) {
    // Return a default no-op implementation instead of throwing
    // This allows pages to be statically generated without errors
    return {
      execute: async (_action: string) => Promise.resolve(null),
      reset: () => {},
      isReady: false,
    };
  }
  return context;
}

interface TurnstileProviderProps {
  children: ReactNode;
}

export function TurnstileProvider({ children }: TurnstileProviderProps) {
  // Community Edition: Always return null (no CAPTCHA)
  const execute = useCallback(async (_action: string): Promise<string | null> => {
    // No-op: Community Edition doesn't use CAPTCHA
    return null;
  }, []);

  const reset = useCallback(() => {
    // No-op: Nothing to reset
  }, []);

  const value: TurnstileContextValue = {
    execute,
    reset,
    isReady: true, // Always ready (no initialization needed)
  };

  return (
    <TurnstileContext.Provider value={value}>
      {children}
    </TurnstileContext.Provider>
  );
}
