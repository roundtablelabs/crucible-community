/**
 * useSummaryHandlers hook
 * Manages summary editing handlers (confirm and cancel)
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LaunchpadTransferCache } from "../types";

type UseSummaryHandlersOptions = {
  transferToLaunchpad: (data: LaunchpadTransferCache) => void;
  skipWarning: () => void;
  setIntakeSummary: React.Dispatch<React.SetStateAction<string | null>>;
  setIsEditingSummary: React.Dispatch<React.SetStateAction<boolean>>;
  setUploadedSummary: React.Dispatch<React.SetStateAction<string | null>>;
  setUploadError: React.Dispatch<React.SetStateAction<string | null>>;
};

type UseSummaryHandlersReturn = {
  handleSummaryConfirm: (editedSummary: string) => void;
  handleSummaryCancel: () => void;
};

/**
 * Hook to manage summary editing handlers
 */
export function useSummaryHandlers({
  transferToLaunchpad,
  skipWarning,
  setIntakeSummary,
  setIsEditingSummary,
  setUploadedSummary,
  setUploadError,
}: UseSummaryHandlersOptions): UseSummaryHandlersReturn {
  const router = useRouter();

  /**
   * Confirm edited summary and navigate to launchpad
   */
  const handleSummaryConfirm = useCallback(
    (editedSummary: string) => {
      setIntakeSummary(editedSummary);
      setIsEditingSummary(false);
      setUploadedSummary(null);
      
      // Redirect to launchpad with summary (same as chat flow)
      transferToLaunchpad({
        messages: [],
        summary: editedSummary,
        autoStart: true,
      });
      skipWarning();
      router.push("/app/launchpad");
    },
    [transferToLaunchpad, router, skipWarning, setIntakeSummary, setIsEditingSummary, setUploadedSummary]
  );

  /**
   * Cancel summary editing
   */
  const handleSummaryCancel = useCallback(() => {
    setIsEditingSummary(false);
    setUploadedSummary(null);
    setUploadError(null);
  }, [setIsEditingSummary, setUploadedSummary, setUploadError]);

  return {
    handleSummaryConfirm,
    handleSummaryCancel,
  };
}

