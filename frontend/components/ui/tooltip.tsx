"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

type TooltipProps = {
  content: string | React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  showIcon?: boolean;
  delay?: number;
};

export function Tooltip({ 
  content, 
  children, 
  side = "top", 
  className,
  showIcon = false,
  delay = 200,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, arrowOffset: 0 });
  const [actualSide, setActualSide] = useState<"top" | "bottom" | "left" | "right">(side);
  const [isPositioned, setIsPositioned] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollElementsRef = useRef<Array<{ element: Element | Window; handler: () => void; type: 'scroll' | 'resize' }>>([]);

  // Memoize updatePosition to avoid stale closures
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;
    
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    // If tooltip hasn't rendered yet (dimensions are 0), wait for next frame
    if (tooltipRect.width === 0 || tooltipRect.height === 0) {
      rafRef.current = requestAnimationFrame(updatePosition);
      return;
    }

    const padding = 16;
    const gap = 12;
    const arrowSize = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate available space in each direction
    const spaceAbove = triggerRect.top - padding;
    const spaceBelow = viewportHeight - triggerRect.bottom - padding;
    const spaceLeft = triggerRect.left - padding;
    const spaceRight = viewportWidth - triggerRect.right - padding;

    // Determine best side with auto-flip logic
    let bestSide = side;
    if (side === "top" && spaceAbove < tooltipRect.height + gap && spaceBelow > spaceAbove) {
      bestSide = "bottom";
    } else if (side === "bottom" && spaceBelow < tooltipRect.height + gap && spaceAbove > spaceBelow) {
      bestSide = "top";
    } else if (side === "left" && spaceLeft < tooltipRect.width + gap && spaceRight > spaceLeft) {
      bestSide = "right";
    } else if (side === "right" && spaceRight < tooltipRect.width + gap && spaceLeft > spaceRight) {
      bestSide = "left";
    }

    setActualSide(bestSide);

    let top = 0;
    let left = 0;
    let arrowOffset = 0;
    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const triggerCenterY = triggerRect.top + triggerRect.height / 2;

    // Calculate initial position based on best side
    switch (bestSide) {
      case "top":
        top = triggerRect.top - tooltipRect.height - gap;
        left = triggerCenterX - tooltipRect.width / 2;
        arrowOffset = triggerCenterX - left;
        break;
      case "bottom":
        top = triggerRect.bottom + gap;
        left = triggerCenterX - tooltipRect.width / 2;
        arrowOffset = triggerCenterX - left;
        break;
      case "left":
        top = triggerCenterY - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - gap;
        arrowOffset = triggerCenterY - top;
        break;
      case "right":
        top = triggerCenterY - tooltipRect.height / 2;
        left = triggerRect.right + gap;
        arrowOffset = triggerCenterY - top;
        break;
    }

    // Adjust for horizontal boundaries (for top/bottom tooltips)
    if (bestSide === "top" || bestSide === "bottom") {
      const minLeft = padding;
      const maxLeft = viewportWidth - tooltipRect.width - padding;
      
      if (left < minLeft) {
        const adjustment = minLeft - left;
        left = minLeft;
        // Recalculate arrow offset to point to trigger center after adjustment
        const newTriggerCenterX = triggerRect.left + triggerRect.width / 2;
        arrowOffset = Math.max(arrowSize, Math.min(newTriggerCenterX - left, tooltipRect.width - arrowSize));
      } else if (left > maxLeft) {
        const adjustment = left - maxLeft;
        left = maxLeft;
        // Recalculate arrow offset to point to trigger center after adjustment
        const newTriggerCenterX = triggerRect.left + triggerRect.width / 2;
        arrowOffset = Math.max(arrowSize, Math.min(newTriggerCenterX - left, tooltipRect.width - arrowSize));
      }
    }

    // Adjust for vertical boundaries (for left/right tooltips)
    if (bestSide === "left" || bestSide === "right") {
      const minTop = padding;
      const maxTop = viewportHeight - tooltipRect.height - padding;
      
      if (top < minTop) {
        const adjustment = minTop - top;
        top = minTop;
        // Recalculate arrow offset to point to trigger center after adjustment
        const newTriggerCenterY = triggerRect.top + triggerRect.height / 2;
        arrowOffset = Math.max(arrowSize, Math.min(newTriggerCenterY - top, tooltipRect.height - arrowSize));
      } else if (top > maxTop) {
        const adjustment = top - maxTop;
        top = maxTop;
        // Recalculate arrow offset to point to trigger center after adjustment
        const newTriggerCenterY = triggerRect.top + triggerRect.height / 2;
        arrowOffset = Math.max(arrowSize, Math.min(newTriggerCenterY - top, tooltipRect.height - arrowSize));
      }
    }

    // Final boundary check - ensure tooltip is fully visible
    if (left < padding) left = padding;
    if (left + tooltipRect.width > viewportWidth - padding) {
      left = viewportWidth - tooltipRect.width - padding;
    }
    if (top < padding) top = padding;
    if (top + tooltipRect.height > viewportHeight - padding) {
      top = viewportHeight - tooltipRect.height - padding;
    }

    setPosition({ top, left, arrowOffset });
    setIsPositioned(true);
  }, [side]);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      // Use requestAnimationFrame to ensure tooltip is rendered before calculating position
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(updatePosition);
      });

      // Update on window scroll and resize
      const scrollHandler = () => updatePosition();
      const resizeHandler = () => updatePosition();
      
      window.addEventListener("scroll", scrollHandler, { passive: true });
      window.addEventListener("resize", resizeHandler);
      
      scrollElementsRef.current.push(
        { element: window, handler: scrollHandler, type: 'scroll' },
        { element: window, handler: resizeHandler, type: 'resize' }
      );

      // Also listen to scroll events on parent containers
      let parent: Element | null = triggerRef.current.parentElement;
      while (parent && parent !== document.body) {
        const parentScrollHandler = () => updatePosition();
        parent.addEventListener("scroll", parentScrollHandler, { passive: true });
        scrollElementsRef.current.push({ element: parent, handler: parentScrollHandler, type: 'scroll' });
        parent = parent.parentElement;
      }

      return () => {
        // Cancel pending animation frames
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        
        // Remove all event listeners
        scrollElementsRef.current.forEach(({ element, handler, type }) => {
          if (element === window) {
            if (type === 'scroll') {
              window.removeEventListener("scroll", handler, { passive: true } as EventListenerOptions);
            } else if (type === 'resize') {
              window.removeEventListener("resize", handler);
            }
          } else {
            (element as Element).removeEventListener("scroll", handler, { passive: true } as EventListenerOptions);
          }
        });
        scrollElementsRef.current = [];
      };
    }
  }, [isVisible, updatePosition]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
    setIsPositioned(false);
    setActualSide(side); // Reset to original side
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Arrow component based on actual side (may differ from requested side due to auto-flip)
  const renderArrow = () => {
    const arrowSize = 8;
    const arrowStyle: React.CSSProperties = {
      position: "absolute",
      width: 0,
      height: 0,
    };

    switch (actualSide) {
      case "top":
        arrowStyle.bottom = `-${arrowSize}px`;
        arrowStyle.left = `${position.arrowOffset}px`;
        arrowStyle.borderLeft = `${arrowSize}px solid transparent`;
        arrowStyle.borderRight = `${arrowSize}px solid transparent`;
        arrowStyle.borderTop = `${arrowSize}px solid rgba(217, 164, 65, 0.3)`;
        arrowStyle.transform = "translateX(-50%)";
        break;
      case "bottom":
        arrowStyle.top = `-${arrowSize}px`;
        arrowStyle.left = `${position.arrowOffset}px`;
        arrowStyle.borderLeft = `${arrowSize}px solid transparent`;
        arrowStyle.borderRight = `${arrowSize}px solid transparent`;
        arrowStyle.borderBottom = `${arrowSize}px solid rgba(217, 164, 65, 0.3)`;
        arrowStyle.transform = "translateX(-50%)";
        break;
      case "left":
        arrowStyle.right = `-${arrowSize}px`;
        arrowStyle.top = `${position.arrowOffset}px`;
        arrowStyle.borderTop = `${arrowSize}px solid transparent`;
        arrowStyle.borderBottom = `${arrowSize}px solid transparent`;
        arrowStyle.borderLeft = `${arrowSize}px solid rgba(217, 164, 65, 0.3)`;
        arrowStyle.transform = "translateY(-50%)";
        break;
      case "right":
        arrowStyle.left = `-${arrowSize}px`;
        arrowStyle.top = `${position.arrowOffset}px`;
        arrowStyle.borderTop = `${arrowSize}px solid transparent`;
        arrowStyle.borderBottom = `${arrowSize}px solid transparent`;
        arrowStyle.borderRight = `${arrowSize}px solid rgba(217, 164, 65, 0.3)`;
        arrowStyle.transform = "translateY(-50%)";
        break;
    }

    return <div style={arrowStyle} />;
  };


  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn("inline-flex items-center gap-1", className)}
      >
        {children}
        {showIcon && (
          <Info className="h-3.5 w-3.5 text-base-subtext/60" aria-hidden="true" />
        )}
      </div>
      {isVisible && typeof window !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          className={cn(
            "fixed z-[99999] rounded-xl border-2 border-gold-500/40 bg-[rgba(15,12,8,0.98)] backdrop-blur-xl px-4 py-3 text-sm text-base-text shadow-2xl",
            "pointer-events-none max-w-sm transition-opacity duration-150",
            "before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br before:from-gold-500/5 before:to-transparent before:pointer-events-none",
            !isPositioned && "opacity-0"
          )}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          <div className="relative z-10">
            {typeof content === "string" ? (
              <p className="leading-relaxed whitespace-pre-line">{content}</p>
            ) : (
              content
            )}
          </div>
          {renderArrow()}
        </div>,
        document.body
      )}
    </>
  );
}

