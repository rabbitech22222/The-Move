"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export function DialogContent({ children }: { children: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(600px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded p-1 hover:bg-[var(--muted)]"
          aria-label="Close"
        >
          <X size={18} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
