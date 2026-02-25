"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex items-start gap-3 w-full rounded-lg border border-border bg-card p-4 shadow-lg text-sm text-foreground",
          title: "font-medium text-foreground",
          description: "text-muted-foreground text-xs mt-0.5",
          actionButton:
            "bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded hover:bg-primary/90 transition-colors",
          cancelButton:
            "text-muted-foreground text-xs px-2 py-1 rounded hover:text-foreground transition-colors",
          success: "!border-green-500/30 !bg-green-500/5",
          error: "!border-red-500/30 !bg-red-500/5",
          warning: "!border-amber-500/30 !bg-amber-500/5",
          info: "!border-blue-500/30 !bg-blue-500/5",
        },
      }}
      theme="dark"
      richColors
    />
  );
}
