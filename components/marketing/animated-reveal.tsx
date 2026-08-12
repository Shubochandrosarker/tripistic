"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

/**
 * Scroll reveal for marketing sections.
 *
 * The bug this shape exists to prevent: `whileInView` waits on an
 * IntersectionObserver callback, and elements that are *already* in the
 * viewport at mount do not reliably produce one. The previous version also set
 * `margin: "-80px"`, shrinking the observation box inward so the topmost
 * content had to be scrolled *past* before it counted as visible. Together
 * that left the homepage hero — headline, sub-headline and both CTAs — stuck
 * at `opacity: 0` for a visitor who never scrolled. LCP painted a background
 * photograph and nothing else, and a crawler rendering without scrolling saw
 * an empty hero.
 *
 * Three changes, each closing part of that:
 *
 *   - **`immediate`** animates on mount instead of on intersection. Anything
 *     above the fold must use it; there is nothing to wait for.
 *   - **`amount: 0.1`** replaces the negative root margin, so a section counts
 *     as visible once a tenth of it is on screen rather than after it has been
 *     scrolled past.
 *   - **`data-reveal`** gives the no-JS fallback in the root layout something
 *     to target, so a hydration failure can never leave content invisible.
 *
 * `useReducedMotion` is honoured by rendering a plain element: a user who has
 * asked for no motion should get content immediately, not a shorter animation.
 */
export function AnimatedReveal({
  children,
  immediate = false,
  delay = 0,
  className,
  ...props
}: Omit<HTMLMotionProps<"div">, "children"> & {
  // Narrowed from Framer's `ReactNode | MotionValue`: the reduced-motion
  // branch renders a plain `<div>`, which cannot accept a MotionValue child.
  children?: React.ReactNode;
  immediate?: boolean;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div data-reveal className={className}>
        {children}
      </div>
    );
  }

  const transition = { duration: 0.55, ease: "easeOut" as const, delay };

  if (immediate) {
    return (
      <motion.div
        data-reveal
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      data-reveal
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={transition}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
