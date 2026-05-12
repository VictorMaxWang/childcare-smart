"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ConfirmDialogVariant = "default" | "danger";

export interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel?: string;
  description?: React.ReactNode;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  variant?: ConfirmDialogVariant;
}

export function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  description,
  loading = false,
  onConfirm,
  onOpenChange,
  open,
  title,
  variant = "default",
}: ConfirmDialogProps) {
  const Icon = variant === "danger" ? AlertTriangle : CheckCircle2;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <DialogContent
        className="gap-0 overflow-hidden rounded-[18px] border border-slate-200 bg-white p-0 shadow-[0_26px_86px_rgb(15_23_42_/_0.22)] sm:top-[58%] sm:max-w-[470px]"
        onInteractOutside={(event) => {
          if (loading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (loading) event.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pb-3 pt-5 pr-14">
          <div
            className={cn(
              "mb-2 flex h-11 w-11 items-center justify-center rounded-full",
              variant === "danger" ? "bg-rose-50 text-rose-600 ring-8 ring-rose-50/70" : "bg-indigo-50 text-indigo-600 ring-8 ring-indigo-50/70"
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-950">{title}</DialogTitle>
          {description ? <DialogDescription className="mt-2 text-sm leading-5 text-slate-500">{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5 sm:grid-cols-2 sm:justify-stretch">
          <Button type="button" variant="outline" className="min-h-10 rounded-xl" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "danger" : "primary"}
            className="min-h-10 rounded-xl"
            loading={loading}
            onClick={() => void onConfirm()}
            data-testid="r08-confirm-dialog-confirm"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
