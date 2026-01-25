"use client";

import { useState, useCallback } from "react";
import { useMutation, UseMutationOptions, UseMutationResult } from "@tanstack/react-query";

interface RetryableMutationOptions<TData, TError, TVariables, TContext> 
  extends Omit<UseMutationOptions<TData, TError, TVariables, TContext>, "onError"> {
  maxRetries?: number;
  onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;
}

type UseRetryableMutationResult<TData, TError, TVariables, TContext> = UseMutationResult<TData, TError, TVariables, TContext> & {
  retryCount: number;
  retry: () => void;
  canRetry: boolean;
};

/**
 * Custom hook for React Query mutations with retry capability
 * Manages retry state and provides retry function
 */
export function useRetryableMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
  options: RetryableMutationOptions<TData, TError, TVariables, TContext>
): UseRetryableMutationResult<TData, TError, TVariables, TContext> {
  const { maxRetries = 3, onError, ...mutationOptions } = options;
  const [retryCount, setRetryCount] = useState(0);
  const [lastVariables, setLastVariables] = useState<TVariables | undefined>(undefined);
  const [lastContext, setLastContext] = useState<TContext | undefined>(undefined);

  const mutation = useMutation<TData, TError, TVariables, TContext>({
    ...mutationOptions,
    onError: (error, variables, context) => {
      setLastVariables(variables);
      setLastContext(context);
      onError?.(error, variables, context);
    },
    onSuccess: () => {
      // Reset retry count on success
      setRetryCount(0);
      setLastVariables(undefined);
      setLastContext(undefined);
    },
  });

  const retry = useCallback(() => {
    if (retryCount >= maxRetries) {
      return;
    }

    if (lastVariables !== undefined) {
      setRetryCount((prev) => prev + 1);
      mutation.mutate(lastVariables, {
        onError: (error) => {
          options.onError?.(error, lastVariables, lastContext);
        },
      });
    }
  }, [retryCount, maxRetries, lastVariables, lastContext, mutation, options]);

  const canRetry = retryCount < maxRetries && lastVariables !== undefined && !mutation.isPending;

  return {
    ...mutation,
    retryCount,
    retry,
    canRetry,
  };
}

