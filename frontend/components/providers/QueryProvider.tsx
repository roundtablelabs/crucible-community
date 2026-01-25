"use client";

import { ReactNode, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false, // Prevent refetch on tab focus to reduce unnecessary requests
            staleTime: 5 * 60 * 1000, // Increased from 1 minute to 5 minutes to reduce refetches
            refetchOnMount: false, // Don't refetch on mount if data is still fresh
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
