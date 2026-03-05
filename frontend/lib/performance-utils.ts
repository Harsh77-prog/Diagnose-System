/**
 * ✅ Performance Optimization Utilities
 * 
 * Memoization helpers and performance optimization patterns for React components
 * 
 * Note: These are simple, proven hooks that work with TypeScript strict mode
 * and React 19 ESLint rules.
 */

import React, { useRef, useEffect, useState } from "react";

/**
 * Debounce hook - delays function execution
 * Useful for search inputs, resize handlers, or other frequent events
 * 
 * @param value Value to debounce
 * @param delay Delay in milliseconds
 * @returns Debounced value
 * 
 * @example 
 * const debouncedSearchTerm = useDebounce(searchInput, 300);
 * useEffect(() => {
 *   // Search when debounced value changes
 * }, [debouncedSearchTerm]);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Throttle hook - limits function execution frequency  
 * Useful for scroll events, mouse move, or other high-frequency events
 * 
 * @param value Value to throttle
 * @param interval Minimum interval in milliseconds between updates
 * @returns Throttled value
 * 
 * @example 
 * const throttledScroll = useThrottle(scrollY, 100);
 */
export function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdated = useRef<number>(0);

  useEffect(() => {
    const handler = setInterval(() => {
      lastUpdated.current = Date.now();
      setThrottledValue(value);
    }, interval);

    return () => clearInterval(handler);
  }, [value, interval]);

  return throttledValue;
}

/**
 * Intersection Observer hook for lazy rendering
 * Renders component only when it becomes visible in viewport
 * 
 * @param ref React ref pointing to the element
 * @returns true if element is visible, false otherwise
 * 
 * @example 
 * const ref = useRef<HTMLDivElement>(null);
 * const isVisible = useIntersectionObserver(ref);
 * return <div ref={ref}>{isVisible && <HeavyComponent />}</div>;
 */
export function useIntersectionObserver(
  ref: React.RefObject<HTMLElement>
): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const currentRef = ref.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, {
      threshold: 0.1,
    });

    observer.observe(currentRef);

    return () => {
      observer.unobserve(currentRef);
    };
  }, [ref]);

  return isVisible;
}
