
import React, { useRef, useEffect, useState } from "react";


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
