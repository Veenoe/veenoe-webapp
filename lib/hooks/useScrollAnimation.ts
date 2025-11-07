"use client";

import { useEffect, useRef, useState } from "react";

type AnimationOptions = {
  threshold?: number;
  triggerOnce?: boolean;
};

export function useScrollAnimation(options?: AnimationOptions) {
  const [isInView, setIsInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const threshold = options?.threshold || 0.1;
  const triggerOnce = options?.triggerOnce !== undefined ? options.triggerOnce : true;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsInView(false);
        }
      },
      { threshold }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [ref, threshold, triggerOnce]);

  return { ref, isInView };
}