"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import AmbientBackground from "@/components/visuals/AmbientBackground";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AmbientBackground intensity="light" interactive={false} backdropMode="workspace" className="py-10">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-3xl items-center justify-center px-6 page-enter">
        <div className="premium-glass-panel surface-luminous w-full rounded-[2rem] border border-white/14 p-8 text-center shadow-[var(--shadow-card-strong)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/12 text-rose-300">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-white">Something went wrong</h1>
          <p className="mt-3 text-sm leading-6 text-white/68">
            The app hit an unexpected error. Retry this page first; if the problem persists, go back to
            the home page and continue with the rest of the workspace.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={reset} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry page
            </Button>
            <Button variant="outline" onClick={() => window.location.assign("/")}>
              Back to home
            </Button>
          </div>
        </div>
      </div>
    </AmbientBackground>
  );
}
