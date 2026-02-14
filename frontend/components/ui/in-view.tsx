"use client";

import { ReactNode, useRef, useState, useEffect } from "react";
import { motion, type Variant, type Transition } from "framer-motion";

export type InViewProps = {
  children: ReactNode;
  variants?: {
    hidden: Variant;
    visible: Variant;
  };
  transition?: Transition;
  viewOptions?: { once?: boolean; margin?: string; amount?: number };
  as?: React.ElementType;
  once?: boolean;
};

const defaultVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export function InView({
  children,
  variants = defaultVariants,
  transition,
  viewOptions,
  as = "div",
  once,
}: InViewProps) {
  const ref = useRef<HTMLElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasViewed, setHasViewed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (once ?? viewOptions?.once) setHasViewed(true);
        } else if (!(once ?? viewOptions?.once)) {
          setIsInView(false);
        }
      },
      {
        threshold: typeof viewOptions?.amount === "number" ? viewOptions.amount : 0.1,
        rootMargin: viewOptions?.margin ?? "0px",
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once, viewOptions?.once, viewOptions?.amount, viewOptions?.margin]);

  const isVisible = isInView || hasViewed;
  const MotionComp = (as === "div" ? motion.div : as === "section" ? motion.section : motion.div) as typeof motion.div;

  return (
    <MotionComp
      ref={ref as React.RefObject<HTMLDivElement>}
      initial="hidden"
      animate={isVisible ? "visible" : "hidden"}
      variants={variants}
      transition={transition}
    >
      {children}
    </MotionComp>
  );
}
