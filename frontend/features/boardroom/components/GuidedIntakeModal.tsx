"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { HelpCircle } from "lucide-react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { logError } from "@/lib/utils/errorHandler";
import { InlineLoading } from "@/components/ui/InlineLoading";
import {
  readSessionCache,
  writeSessionCache,
  removeSessionCache,
} from "@/lib/storage/sessionCache";
import {
  GUIDED_INTAKE_FORM_CACHE_KEY,
  GUIDED_INTAKE_FORM_CACHE_VERSION,
  GUIDED_INTAKE_FORM_TTL_MS,
} from "@/features/rounds/storageKeys";

type GuidedIntakeModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

type GuidedIntakeFormData = {
  decision: string;
  whyNow: string;
  signals: string;
  constraints: string;
  options: string;
  owner: string;
};

function GuidedIntakeFormField({
  label,
  tooltip,
  value,
  onChange,
  rows,
  placeholder,
  disabled,
  colSpan = 1,
  primary = false,
}: {
  label: string;
  tooltip: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder: string;
  disabled: boolean;
  colSpan?: 1 | 2;
  primary?: boolean;
}) {
  return (
    <label className={`space-y-2 text-sm text-white ${colSpan === 2 ? "md:col-span-2" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-[0.32em] text-gold-200/60">{label}</span>
        <div className="group relative">
          <HelpCircle className="h-3.5 w-3.5 text-gold-500/50 cursor-help transition hover:text-gold-500" aria-hidden="true" />
          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded-xl border border-gold-500/30 bg-[rgba(15,12,8,0.98)] p-3 text-xs leading-relaxed text-gold-100/90 opacity-0 shadow-[0_16px_40px_rgba(10,8,4,0.55)] transition duration-200 group-hover:block group-hover:opacity-100">
            {tooltip}
          </div>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className={`w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none transition ${
          primary
            ? "border-gold-500/30 bg-[rgba(20,18,12,0.95)] focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30"
            : "border-gold-500/25 bg-[rgba(20,18,12,0.85)] focus:border-gold-500/70 focus:ring-2 focus:ring-gold-500/20"
        }`}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );
}

function GuidedIntakeModalFocusTrap({
  modalRef,
  onClose,
  triggerElement,
  submitting,
}: {
  modalRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  triggerElement: HTMLElement | null;
  submitting: boolean;
}) {
  useFocusTrap(modalRef, {
    isOpen: true,
    onEscape: submitting ? undefined : onClose,
    lockBodyScroll: true,
    returnFocus: true,
    triggerElement,
    disableBackdropClick: false,
  });
  return null;
}

export function GuidedIntakeModal({
  open,
  onClose,
  onSubmit,
  triggerRef,
}: GuidedIntakeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Form state
  const [decision, setDecision] = useState("");
  const [whyNow, setWhyNow] = useState("");
  const [signals, setSignals] = useState("");
  const [constraints, setConstraints] = useState("");
  const [options, setOptions] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Debounce timer ref for saving form data
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Flag to track if we're currently restoring data (to skip redundant saves during restore)
  const isRestoringRef = useRef(false);
  // Track previous open state to detect when modal first opens
  const prevOpenRef = useRef(open);
  
  // Restore form data from sessionStorage when modal opens
  useEffect(() => {
    // Only restore if modal just opened (was closed, now open)
    const justOpened = !prevOpenRef.current && open;
    prevOpenRef.current = open;
    
    if (!open) {
      isRestoringRef.current = false;
      return;
    }
    
    if (!justOpened) {
      return;
    }
    
    // Set restoration flag to prevent redundant saves during restore
    isRestoringRef.current = true;
    
    const cached = readSessionCache<GuidedIntakeFormData>(
      GUIDED_INTAKE_FORM_CACHE_KEY,
      {
        version: GUIDED_INTAKE_FORM_CACHE_VERSION,
      }
    );
    
    if (cached) {
      setDecision(cached.decision || "");
      setWhyNow(cached.whyNow || "");
      setSignals(cached.signals || "");
      setConstraints(cached.constraints || "");
      setOptions(cached.options || "");
      setOwner(cached.owner || "");
    }
    
    // Clear restoration flag after state updates complete
    // Use requestAnimationFrame to ensure state updates have been processed
    requestAnimationFrame(() => {
      // Use another requestAnimationFrame to ensure React has processed state updates
      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    });
  }, [open]);
  
  // Save form data to sessionStorage with debouncing
  const formData = useMemo<GuidedIntakeFormData>(
    () => ({
      decision,
      whyNow,
      signals,
      constraints,
      options,
      owner,
    }),
    [decision, whyNow, signals, constraints, options, owner]
  );
  
  useEffect(() => {
    if (!open) return;
    
    // Skip saving during initial restoration to avoid redundant save of empty data
    if (isRestoringRef.current) return;
    
    // Clear any existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    
    // Debounce save by 500ms
    saveTimerRef.current = setTimeout(() => {
      // Double-check we're not restoring (in case timer fires during restore)
      if (isRestoringRef.current) return;
      
      const result = writeSessionCache(
        GUIDED_INTAKE_FORM_CACHE_KEY,
        formData,
        {
          version: GUIDED_INTAKE_FORM_CACHE_VERSION,
          ttlMs: GUIDED_INTAKE_FORM_TTL_MS,
        }
      );
      
      if (!result.success) {
        logError(
          new Error(`Failed to save form data: ${result.reason}`),
          "GuidedIntakeModal: saveFormData"
        );
      }
    }, 500);
    
    // Cleanup timer on unmount or when form data changes
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [formData]); // Removed 'open' from dependencies - we check it at the start, and debounce handles saves when closing

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  const resetForm = useCallback(() => {
    setDecision("");
    setWhyNow("");
    setSignals("");
    setConstraints("");
    setOptions("");
    setOwner("");
    setError(null);
    // Clear cached form data after successful submission
    removeSessionCache(GUIDED_INTAKE_FORM_CACHE_KEY);
  }, []);

  const handleSubmit = useCallback(async () => {
    const decisionAsk = decision.trim();
    if (!decisionAsk) {
      setError("Spell out the decision ask (include the choice and time horizon).");
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      const contentLines = [
        "Board-level intake starter",
        `Decision ask: ${decisionAsk}`,
        `Why now: ${whyNow.trim() || "Not provided"}`,
        `Signals: ${signals.trim() || "Not provided"}`,
        `Constraints: ${constraints.trim() || "Not provided"}`,
        `Options: ${options.trim() || "Not provided"}`,
        `Owner & success: ${owner.trim() || "Not provided"}`,
      ];
      
      await onSubmit(contentLines.join("\n"));
      resetForm();
    } catch (err) {
      logError(err, "GuidedIntakeModal: handleSubmit");
      setError("We couldn't prepare that brief. Try again or paste it into the intake chat manually.");
    } finally {
      setSubmitting(false);
    }
  }, [decision, whyNow, signals, constraints, options, owner, onSubmit, resetForm]);

  if (!open) return null;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[98] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-intake-heading"
      onClick={handleClose}
    >
      <GuidedIntakeModalFocusTrap
        modalRef={modalRef}
        onClose={handleClose}
        triggerElement={triggerRef.current}
        submitting={submitting}
      />
      <div
        className="w-full max-w-[calc(100vw-2rem)] sm:max-w-4xl rounded-[32px] border border-gold-500/40 bg-[rgba(15,12,8,0.96)] p-6 text-sm text-gold-100/80 shadow-[0_40px_120px_rgba(10,8,4,0.8)] sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex max-h-[90vh] flex-col">
          <header className="border-b border-white/10 pb-5">
            <p id="guided-intake-heading" className="text-2xl font-semibold text-white">
              Frame a board-level question
            </p>
            <p className="mt-2 leading-relaxed text-gold-100/70">
              For strategic, high-stakes business decisions requiring expert analysis and structured debate. Capture the decision, urgency, signals, constraints, options, and who owns success.
            </p>
            <p className="mt-2 text-xs text-gold-500/70 italic">
              Examples: Market expansion, M&amp;A decisions, major investments, strategic pivots, risk assessments, resource allocation
            </p>
          </header>
          
          <div className="flex flex-1 flex-col gap-6 overflow-hidden py-6 lg:flex-row">
            <div className="flex-1 overflow-hidden overflow-y-auto rounded-2xl border border-gold-500/15 bg-[rgba(20,18,12,0.7)]">
              <div className="space-y-4 overflow-y-auto p-4 pr-5 lg:p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <GuidedIntakeFormField
                    label="Decision ask"
                    tooltip="The core strategic question requiring board-level decision. Should be specific, actionable, and have significant business impact."
                    value={decision}
                    onChange={setDecision}
                    rows={3}
                    placeholder="Example: Should we expand into the APAC market within the next 12 months, or focus on deepening our presence in existing markets?"
                    disabled={submitting}
                    primary
                  />
                  
                  <GuidedIntakeFormField
                    label="Why now"
                    tooltip="Business urgency, market conditions, competitive pressure, or strategic windows that make this decision time-sensitive."
                    value={whyNow}
                    onChange={setWhyNow}
                    rows={3}
                    placeholder="Example: Market opportunity closing, competitor entering space, regulatory deadline approaching, investor pressure, or strategic planning cycle."
                    disabled={submitting}
                  />
                  
                  <GuidedIntakeFormField
                    label="Signals"
                    tooltip="Key data points, metrics, market signals, customer feedback, or business indicators that inform this decision."
                    value={signals}
                    onChange={setSignals}
                    rows={4}
                    placeholder="Example: 40% revenue growth in target region, 3 major customer requests, competitor launched similar product, market research shows 2x demand, regulatory changes favor expansion."
                    disabled={submitting}
                    colSpan={2}
                  />
                  
                  <GuidedIntakeFormField
                    label="Constraints"
                    tooltip="Budget limits, resource constraints, regulatory requirements, timing windows, or other guardrails that bound the decision."
                    value={constraints}
                    onChange={setConstraints}
                    rows={3}
                    placeholder="Example: $5M budget cap, must complete by Q2, requires board approval, limited to 10 new hires, must comply with GDPR."
                    disabled={submitting}
                  />
                  
                  <GuidedIntakeFormField
                    label="Options"
                    tooltip="The strategic alternatives being considered. Include your recommendation and at least one credible alternative for debate."
                    value={options}
                    onChange={setOptions}
                    rows={3}
                    placeholder="Example: Option A: Full APAC expansion (recommended). Option B: Focus on key markets only. Option C: Partner with local distributor instead."
                    disabled={submitting}
                  />
                  
                  <GuidedIntakeFormField
                    label="Owner & success"
                    tooltip="Decision owner (who has final say) and measurable success criteria or guardrails to evaluate outcomes."
                    value={owner}
                    onChange={setOwner}
                    rows={3}
                    placeholder="Example: CEO makes final decision. Success: $10M revenue in Year 1, <15% CAC increase, 80% customer satisfaction. Guardrail: Pause if losses exceed $2M in first 6 months."
                    disabled={submitting}
                    colSpan={2}
                  />
                  
                  {error && (
                    <div className="md:col-span-2">
                      <div className="rounded-2xl border border-amber-400/45 bg-[rgba(83,60,20,0.4)] px-4 py-2 text-xs text-amber-100">
                        {error}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <footer className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4 text-xs uppercase tracking-[0.26em]">
            <button
              type="button"
              onClick={handleClose}
              aria-label="Cancel guided intake"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-full border border-gold-500/35 px-4 py-2 text-gold-200 transition hover:border-gold-400/55 hover:text-white min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit();
              }}
              aria-label={submitting ? "Starting intake..." : "Start guided intake"}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-500 to-gold-600 px-5 py-2 text-[#0b1b2c] transition hover:from-gold-400 hover:to-gold-500 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Click Here
              {submitting && <InlineLoading size="sm" />}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

