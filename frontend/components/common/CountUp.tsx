"use client";

import { useEffect, useRef, useState } from "react";

type CountUpProps = {
  value: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
};

const DEFAULT_DURATION = 900;

export function CountUp({ value, duration = DEFAULT_DURATION, format, className }: CountUpProps) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number>(undefined);
  const [displayValue, setDisplayValue] = useState(() => Math.floor(value * 0.1));

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || typeof value !== "number" || Number.isNaN(value)) {
      setDisplayValue(value);
      return;
    }

    const node = nodeRef.current;
    if (!node) {
      return;
    }

    let start: number | null = null;
    const startValue = displayValue;
    const difference = value - startValue;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (timestamp: number) => {
      if (start === null) {
        start = timestamp;
      }
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const next = startValue + difference * eased;
      setDisplayValue(progress === 1 ? value : next);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          cancelAnimationFrame(frameRef.current ?? 0);
          frameRef.current = requestAnimationFrame(animate);
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const renderValue = () => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "—";
    }
    if (format) {
      return format(Math.round(displayValue));
    }
    return Math.round(displayValue).toLocaleString();
  };

  return (
    <span ref={nodeRef} className={className}>
      {renderValue()}
    </span>
  );
}
