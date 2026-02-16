"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ── Message ── */
interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: string;
}

export function Message({ from, children, className, ...props }: MessageProps) {
  const isUser = from === "user";

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-3",
        isUser ? "is-user justify-end" : "justify-start",
        className,
      )}
      data-role={from}
      {...props}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">
          O
        </div>
      )}
      <div className={cn("max-w-[80%] min-w-0", isUser && "order-first")}>
        {children}
      </div>
    </div>
  );
}

/* ── MessageContent ── */
export function MessageContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-sm text-foreground",
        "group-[.is-user]:bg-secondary group-[.is-user]:text-secondary-foreground group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:rounded-2xl group-[.is-user]:rounded-br-md",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ── MessageResponse (markdown rendering) ── */
interface MessageResponseProps extends React.HTMLAttributes<HTMLDivElement> {
  children: string;
}

export function MessageResponse({
  children: text,
  className,
  ...props
}: MessageResponseProps) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-p:leading-relaxed prose-p:my-1",
        "prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-pre:rounded-lg",
        "prose-code:text-primary prose-code:font-mono prose-code:text-xs",
        "prose-headings:text-foreground prose-headings:font-semibold",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-strong:text-foreground",
        "prose-ul:my-1 prose-ol:my-1 prose-li:my-0",
        className,
      )}
      {...props}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

/* ── MessageActions ── */
export function MessageActions({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 pl-10 -mt-1 mb-1 opacity-0 group-hover:opacity-100 transition-opacity",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ── MessageAction ── */
interface MessageActionProps extends React.ComponentProps<typeof Button> {
  label: string;
  tooltip?: string;
}

export function MessageAction({
  label,
  tooltip,
  children,
  className,
  ...props
}: MessageActionProps) {
  const btn = (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
      aria-label={label}
      {...props}
    >
      {children}
    </Button>
  );

  if (tooltip || label) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {tooltip || label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return btn;
}
