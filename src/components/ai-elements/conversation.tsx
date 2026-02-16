"use client";

import * as React from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ── Conversation ── */
interface ConversationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ConversationContext = React.createContext<{
  scrollToBottom: () => void;
  isAtBottom: boolean;
}>({ scrollToBottom: () => {}, isAtBottom: true });

export function Conversation({ children, className, ...props }: ConversationProps) {
  const { scrollRef, contentRef, scrollToBottom, isAtBottom } =
    useStickToBottom();

  return (
    <ConversationContext.Provider value={{ scrollToBottom, isAtBottom }}>
      <div
        ref={scrollRef}
        className={cn(
          "relative flex-1 overflow-y-auto",
          className,
        )}
        {...props}
      >
        <div ref={contentRef}>{children}</div>
      </div>
    </ConversationContext.Provider>
  );
}

/* ── ConversationContent ── */
export function ConversationContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1 pb-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/* ── ConversationEmptyState ── */
interface ConversationEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}

export function ConversationEmptyState({
  icon,
  title,
  description,
  children,
  className,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="text-muted-foreground/50">{icon}</div>
      )}
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}

/* ── ConversationScrollButton ── */
export function ConversationScrollButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { scrollToBottom, isAtBottom } = React.useContext(ConversationContext);

  if (isAtBottom) return null;

  return (
    <div className="sticky bottom-2 flex justify-center pointer-events-none">
      <Button
        variant="outline"
        size="icon"
        onClick={scrollToBottom}
        className={cn(
          "pointer-events-auto h-8 w-8 rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border/50 hover:bg-background",
          className,
        )}
        {...props}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
