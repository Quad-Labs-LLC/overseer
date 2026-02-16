"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square } from "lucide-react";

/* ── Input (form wrapper — aliased to avoid collision with HTML input) ── */
interface InputProps extends React.FormHTMLAttributes<HTMLFormElement> {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function Input({ children, className, onSubmit, ...props }: InputProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(e);
      }}
      className={cn("relative", className)}
      {...props}
    >
      {children}
    </form>
  );
}

/* ── PromptInputTextarea ── */
interface PromptInputTextareaProps
  extends React.ComponentProps<typeof Textarea> {
  minRows?: number;
  maxRows?: number;
}

export const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(({ className, minRows = 1, maxRows = 6, onInput, ...props }, ref) => {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const combinedRef = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
  };

  const autoResize = React.useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 20;
    const minH = lineHeight * minRows + 16;
    const maxH = lineHeight * maxRows + 16;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minH), maxH)}px`;
  }, [minRows, maxRows]);

  React.useEffect(() => {
    autoResize();
  });

  return (
    <Textarea
      ref={combinedRef}
      rows={minRows}
      className={cn(
        "w-full border-0 bg-transparent shadow-none focus-visible:ring-0 resize-none py-3 px-4 text-sm placeholder:text-muted-foreground",
        className,
      )}
      onInput={(e) => {
        autoResize();
        onInput?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const form = e.currentTarget.closest("form");
          form?.requestSubmit();
        }
      }}
      {...props}
    />
  );
});
PromptInputTextarea.displayName = "PromptInputTextarea";

/* ── PromptInputSubmit ── */
interface PromptInputSubmitProps extends React.ComponentProps<typeof Button> {
  status?: string;
}

export function PromptInputSubmit({
  status,
  disabled,
  className,
  ...props
}: PromptInputSubmitProps) {
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <Button
      type={isStreaming ? "button" : "submit"}
      size="icon"
      disabled={disabled && !isStreaming}
      className={cn(
        "h-8 w-8 rounded-full shrink-0 transition-colors",
        isStreaming
          ? "bg-foreground text-background hover:bg-foreground/90"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
      {...props}
    >
      {isStreaming ? (
        <Square className="h-3 w-3 fill-current" />
      ) : (
        <ArrowUp className="h-4 w-4" />
      )}
    </Button>
  );
}
