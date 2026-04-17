"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import AmbientBackground from "@/components/visuals/AmbientBackground";
import { getRouteVisualProfile } from "@/components/visuals/route-visuals";
import type { RouteTransitionStyle, RouteVisualProfile } from "@/components/visuals/types";
import { cn } from "@/lib/utils";

function useConstrainedMotion() {
  const [constrained, setConstrained] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: none), (pointer: coarse)");
    const platformNavigator = navigator as Navigator & {
      deviceMemory?: number;
    };

    const sync = () => {
      const hasLowMemory =
        typeof platformNavigator.deviceMemory === "number" && platformNavigator.deviceMemory <= 4;
      const hasFewCpuCores =
        typeof platformNavigator.hardwareConcurrency === "number" &&
        platformNavigator.hardwareConcurrency <= 4;

      setConstrained(mediaQuery.matches || hasLowMemory || hasFewCpuCores);
    };

    sync();

    mediaQuery.addEventListener("change", sync);

    return () => {
      mediaQuery.removeEventListener("change", sync);
    };
  }, []);

  return constrained;
}

function getTransitionMotion(input: {
  prefersReducedMotion: boolean;
  constrained: boolean;
  transitionStyle: RouteTransitionStyle;
}) {
  if (input.prefersReducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.16, ease: [0.33, 0, 0.67, 1] as const },
    };
  }

  const subtle = input.transitionStyle === "subtle" || input.constrained;

  return {
    initial: {
      opacity: 0,
      y: subtle ? 6 : 12,
      filter: subtle ? "blur(8px)" : "blur(16px)",
      scale: subtle ? 1 : 0.996,
    },
    animate: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      scale: 1,
    },
    exit: {
      opacity: 0,
      y: subtle ? -4 : -10,
      filter: subtle ? "blur(6px)" : "blur(12px)",
      scale: subtle ? 1 : 1.002,
    },
    transition: {
      duration: subtle ? 0.28 : 0.42,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  };
}

function RouteTransitionViewport({
  children,
  pathname,
  profile,
}: {
  children: ReactNode;
  pathname: string;
  profile: RouteVisualProfile;
}) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const constrainedMotion = useConstrainedMotion();
  const motion = useMemo(
    () =>
      getTransitionMotion({
        prefersReducedMotion,
        constrained: constrainedMotion,
        transitionStyle: profile.transition,
      }),
    [constrainedMotion, prefersReducedMotion, profile.transition]
  );

  return (
    <AnimatePresence initial={false} mode="wait">
      <m.div
        key={pathname}
        initial={motion.initial}
        animate={motion.animate}
        exit={motion.exit}
        transition={motion.transition}
        className="global-visual-shell__viewport"
        data-route-transition={profile.transition}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

export default function GlobalVisualShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const profile = useMemo(() => getRouteVisualProfile(pathname), [pathname]);

  const shellClassName = cn(
    "global-visual-shell",
    `global-visual-shell--${profile.mode}`,
    `global-visual-shell--${profile.intensity}`,
    profile.mode === "global" ? "global-visual-shell--ambient-managed" : null
  );

  const page = (
    <RouteTransitionViewport pathname={pathname} profile={profile}>
      {children}
    </RouteTransitionViewport>
  );

  return (
    <div
      className={shellClassName}
      data-route-visual-mode={profile.mode}
      data-route-visual-intensity={profile.intensity}
      data-route-visual-tone={profile.tone}
      data-route-visual-transition={profile.transition}
    >
      {profile.mode === "global" ? (
        <AmbientBackground
          ownership="global"
          intensity={profile.intensity}
          tone={profile.tone}
          interactive={profile.interactive}
          className="global-visual-shell__ambient"
          contentClassName="global-visual-shell__content"
        >
          {page}
        </AmbientBackground>
      ) : (
        <div className="global-visual-shell__content">{page}</div>
      )}
    </div>
  );
}
