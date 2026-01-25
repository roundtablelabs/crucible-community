"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

type LazyLoadProps = {
  children: ReactNode;
  rootMargin?: string;
  fallback?: ReactNode;
  className?: string;
};

/**
 * LazyLoad component that uses Intersection Observer to load content
 * only when it comes into view. Useful for below-fold content.
 */
export function LazyLoad({ 
  children, 
  rootMargin = "100px", 
  fallback = null,
  className 
}: LazyLoadProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // If IntersectionObserver is not available, load immediately
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      setHasLoaded(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            setHasLoaded(true);
            // Once loaded, we can stop observing
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin,
        threshold: 0.01,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      {hasLoaded ? children : fallback}
    </div>
  );
}

