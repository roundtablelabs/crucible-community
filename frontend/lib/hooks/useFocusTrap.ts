"use client";

import { useEffect, useRef, RefObject } from "react";

interface UseFocusTrapOptions {
  /**
   * Whether the modal is open
   */
  isOpen: boolean;
  /**
   * Callback when Escape key is pressed
   */
  onEscape?: () => void;
  /**
   * Whether to lock body scroll when modal is open
   */
  lockBodyScroll?: boolean;
  /**
   * Whether to return focus to the trigger element after close
   */
  returnFocus?: boolean;
  /**
   * The element that triggered the modal (for focus return)
   */
  triggerElement?: HTMLElement | null;
  /**
   * Whether to disable backdrop click (for destructive actions)
   */
  disableBackdropClick?: boolean;
}

/**
 * Hook for managing focus trapping, Escape key handling, and focus return in modals
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: UseFocusTrapOptions
) {
  const {
    isOpen,
    onEscape,
    lockBodyScroll = true,
    returnFocus = true,
    triggerElement,
    disableBackdropClick = false,
  } = options;

  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const firstFocusableRef = useRef<HTMLElement | null>(null);
  const lastFocusableRef = useRef<HTMLElement | null>(null);

  // Store the active element when modal opens
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!lockBodyScroll || !isOpen) return;

    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen, lockBodyScroll]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !onEscape) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onEscape();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onEscape]);

  // Focus trap: keep focus within the modal
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;

    // Get all focusable elements within the container
    const getFocusableElements = (): HTMLElement[] => {
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');

      return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors))
        .filter((el) => {
          // Filter out elements that are not visible
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
    };

    const focusableElements = getFocusableElements();
    
    if (focusableElements.length === 0) return;

    firstFocusableRef.current = focusableElements[0];
    lastFocusableRef.current = focusableElements[focusableElements.length - 1];

    // Focus the first element when modal opens
    const firstElement = firstFocusableRef.current;
    if (firstElement) {
      // Use setTimeout to ensure the modal is fully rendered
      setTimeout(() => {
        firstElement.focus();
      }, 0);
    }

    // Handle Tab key to trap focus
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey) {
        // Shift + Tab: going backwards
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastFocusableRef.current?.focus();
        }
      } else {
        // Tab: going forwards
        if (document.activeElement === lastFocusableRef.current) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTab);

    return () => {
      container.removeEventListener('keydown', handleTab);
    };
  }, [isOpen, containerRef]);

  // Return focus to trigger element when modal closes
  useEffect(() => {
    if (isOpen || !returnFocus) return;

    // Use setTimeout to ensure the modal is fully closed
    const timeoutId = setTimeout(() => {
      const elementToFocus = triggerElement || previousActiveElementRef.current;
      
      if (elementToFocus && typeof elementToFocus.focus === 'function') {
        try {
          elementToFocus.focus();
        } catch (error) {
          // Fallback: focus might fail if element is no longer in DOM
          console.warn('Failed to return focus:', error);
        }
      }
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isOpen, returnFocus, triggerElement]);

  return {
    disableBackdropClick,
  };
}

