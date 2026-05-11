"use client";

import * as React from "react";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

export interface ResponsiveDetailSheetProps {
  bodyClassName?: string;
  children: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  testId?: string;
  title: React.ReactNode;
}

export function ResponsiveDetailSheet({
  bodyClassName,
  children,
  className,
  description,
  footer,
  onOpenChange,
  open,
  testId,
  title,
}: ResponsiveDetailSheetProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(isDesktop ? "w-[min(100%,36rem)]" : "max-h-[88dvh]", className)}
        data-testid={testId}
      >
        <DrawerHeader>
          <DrawerTitle className="text-xl font-semibold text-slate-950">{title}</DrawerTitle>
          {description ? (
            <DrawerDescription className="mt-2 text-sm leading-6 text-slate-500">{description}</DrawerDescription>
          ) : null}
        </DrawerHeader>
        <DrawerBody className={cn("space-y-4", bodyClassName)}>{children}</DrawerBody>
        {footer ? <DrawerFooter>{footer}</DrawerFooter> : null}
      </DrawerContent>
    </Drawer>
  );
}
