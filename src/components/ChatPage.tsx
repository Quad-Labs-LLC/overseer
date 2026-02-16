"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  Input,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  Copy,
  RefreshCcw,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Settings,
  Sparkles,
  ChevronDown,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Fragment } from "react";

/* ── Provider type ── */
interface ProviderOption {
  id: number;
  displayName: string;
  model: string;
  isDefault: number | boolean;
}

/* ── Suggestion chips ── */
const SUGGESTIONS = [
  { icon: "💡", text: "Explain how this server is set up" },
  { icon: "📝", text: "Write a Python script to monitor disk usage" },
  { icon: "🔍", text: "Help me debug a networking issue" },
  { icon: "🚀", text: "What can you do?" },
];

/* ── Theme hook ── */
function useTheme() {
  const [theme, setThemeState] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("overseer-theme") as "dark" | "light" | null;
    const initial = stored || "dark";
    setThemeState(initial);
    document.documentElement.classList.toggle("light", initial === "light");
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("overseer-theme", next);
      document.documentElement.classList.toggle("light", next === "light");
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}

/* ── Main Chat Page ── */
export default function ChatPage() {
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<number | undefined>();
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const { messages, sendMessage, status, setMessages, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/webui/chat",
      body: { providerId: selectedProvider },
    }),
  });

  // Load available providers
  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((data) => {
        if (data.providers) {
          setProviders(data.providers);
          const def = data.providers.find((p: ProviderOption) => p.isDefault);
          if (def) setSelectedProvider(def.id);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    sendMessage({ text });
  };

  const handleNewChat = () => {
    setMessages([]);
  };

  const isStreaming = status === "streaming" || status === "submitted";
  const currentProvider = providers.find((p) => p.id === selectedProvider);

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card transition-all duration-200 ease-in-out shrink-0",
          sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0",
        )}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground tracking-tight">Overseer</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-sm"
            onClick={handleNewChat}
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Chat history will appear here
          </p>
        </div>

        {/* Sidebar footer */}
        <div className="border-t border-border p-2 space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sm text-muted-foreground hover:text-foreground"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sm text-muted-foreground hover:text-foreground"
            asChild
          >
            <a href="/admin">
              <LayoutDashboard className="h-4 w-4" />
              Admin Panel
            </a>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sm text-muted-foreground hover:text-foreground"
            asChild
          >
            <a href="/admin/settings">
              <Settings className="h-4 w-4" />
              Settings
            </a>
          </Button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
          {!sidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}

          {/* Model selector */}
          <div className="relative">
            <Button
              variant="ghost"
              className="gap-1.5 text-sm font-medium h-8"
              onClick={() => setShowProviderMenu(!showProviderMenu)}
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {currentProvider?.displayName || "Select model"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
            {showProviderMenu && (
              <div className="absolute top-full left-0 mt-1 w-72 rounded-lg border border-border bg-popover shadow-xl z-50 py-1 animate-fade-in">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProvider(p.id);
                      setShowProviderMenu(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between",
                      p.id === selectedProvider && "bg-accent",
                    )}
                  >
                    <div>
                      <div className="font-medium text-foreground">{p.displayName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.model}</div>
                    </div>
                    {p.isDefault ? (
                      <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium">
                        Default
                      </span>
                    ) : null}
                  </button>
                ))}
                {providers.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No providers configured</p>
                )}
              </div>
            )}
          </div>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewChat}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </header>

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Conversation className="flex-1">
            <ConversationContent className="max-w-3xl mx-auto w-full px-4">
              {messages.length === 0 ? (
                <ConversationEmptyState
                  icon={<Sparkles className="h-10 w-10 text-primary" />}
                  title="How can I help you?"
                  description="Ask me anything — I can help with coding, system administration, writing, and more."
                >
                  <div className="grid grid-cols-2 gap-2 mt-4 w-full max-w-lg">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.text}
                        onClick={() => handleSuggestion(s.text)}
                        className="text-left text-sm px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-accent hover:border-border/80 transition-colors"
                      >
                        <span className="mr-1.5">{s.icon}</span>
                        {s.text}
                      </button>
                    ))}
                  </div>
                </ConversationEmptyState>
              ) : (
                <>
                  {messages.map((message, idx) => (
                    <Fragment key={message.id}>
                      {message.parts.map((part, i) => {
                        switch (part.type) {
                          case "text": {
                            const isLast = idx === messages.length - 1;
                            return (
                              <Fragment key={`${message.id}-${i}`}>
                                <Message from={message.role}>
                                  <MessageContent>
                                    <MessageResponse>{part.text}</MessageResponse>
                                  </MessageContent>
                                </Message>
                                {message.role === "assistant" && isLast && !isStreaming && (
                                  <MessageActions>
                                    <MessageAction
                                      label="Copy"
                                      onClick={() => navigator.clipboard.writeText(part.text)}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </MessageAction>
                                    <MessageAction
                                      label="Regenerate"
                                      onClick={() => regenerate()}
                                    >
                                      <RefreshCcw className="h-3 w-3" />
                                    </MessageAction>
                                  </MessageActions>
                                )}
                              </Fragment>
                            );
                          }
                          default:
                            return null;
                        }
                      })}
                    </Fragment>
                  ))}
                  {/* Thinking indicator */}
                  {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                    <div className="flex gap-3 px-4 py-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">
                        O
                      </div>
                      <div className="flex items-center gap-1 pt-2">
                        <span className="thinking-dot h-2 w-2 rounded-full bg-primary" />
                        <span className="thinking-dot h-2 w-2 rounded-full bg-primary" />
                        <span className="thinking-dot h-2 w-2 rounded-full bg-primary" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {/* Input area */}
          <div className="shrink-0 border-t border-border bg-background">
            <div className="max-w-3xl mx-auto w-full px-4 py-3">
              <Input onSubmit={handleSubmit} className="relative">
                <div className="flex items-end gap-2 rounded-xl border border-border bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring transition-shadow">
                  <PromptInputTextarea
                    value={input}
                    onChange={(e) => setInput(e.currentTarget.value)}
                    placeholder="Message Overseer..."
                    className="flex-1 min-h-0"
                    minRows={1}
                    maxRows={6}
                    disabled={isStreaming}
                  />
                  <div className="p-2">
                    <PromptInputSubmit
                      status={isStreaming ? "streaming" : "ready"}
                      disabled={!input.trim() && !isStreaming}
                    />
                  </div>
                </div>
              </Input>
              <p className="text-center text-[11px] text-muted-foreground mt-2">
                Overseer can make mistakes. Verify important information.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Click-away for provider menu */}
      {showProviderMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowProviderMenu(false)}
        />
      )}
    </div>
  );
}
