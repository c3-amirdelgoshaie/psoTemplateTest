/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 *
 * ChatContext — manages chat sidebar visibility, multi-conversation history,
 * and open tabs (conversations pinned to the tab bar for quick switching).
 */

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fullContent?: string;
  isTyping?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

interface ChatContextValue {
  /** Whether the sidebar is open. */
  isOpen: boolean;
  toggleSidebar: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;

  /** All conversations (newest first). */
  conversations: Conversation[];
  /** The conversation currently being viewed / chatted in. */
  activeConversationId: string | null;
  /** Switch to a different conversation (also opens it as a tab). */
  setActiveConversation: (id: string) => void;

  /** Start a brand-new conversation, open it as a tab, and make it active. */
  startNewConversation: () => string;
  /** Update the messages array for a conversation. */
  updateMessages: (conversationId: string, messages: ChatMessage[]) => void;
  /** Update the title of a conversation. */
  updateTitle: (conversationId: string, title: string) => void;

  /** Ordered list of conversation IDs currently open as tabs. */
  openTabs: string[];
  /** Close a tab. If it was active, switch to the nearest neighbour. */
  closeTab: (id: string) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);

  const toggleSidebar = useCallback(() => setIsOpen((p) => !p), []);
  const openSidebar = useCallback(() => setIsOpen(true), []);
  const closeSidebar = useCallback(() => setIsOpen(false), []);

  /** Ensure a conversation id is in the tab bar. */
  const ensureTab = useCallback((id: string) => {
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const startNewConversation = useCallback(() => {
    const id = `conv-${Date.now()}`;
    const convo: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };
    setConversations((prev) => [convo, ...prev]);
    setActiveConversationId(id);
    ensureTab(id);
    return id;
  }, [ensureTab]);

  const setActiveConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      ensureTab(id);
    },
    [ensureTab],
  );

  const closeTab = useCallback(
    (id: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t !== id);
        // If the closed tab was the active one, switch to the nearest tab
        if (id === activeConversationId) {
          const closedIdx = prev.indexOf(id);
          const neighbour = next[Math.min(closedIdx, next.length - 1)] ?? null;
          setActiveConversationId(neighbour);
        }
        return next;
      });
    },
    [activeConversationId],
  );

  const updateMessages = useCallback((conversationId: string, messages: ChatMessage[]) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, messages } : c)),
    );
  }, []);

  const updateTitle = useCallback((conversationId: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
    );
  }, []);

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        toggleSidebar,
        openSidebar,
        closeSidebar,
        conversations,
        activeConversationId,
        setActiveConversation,
        startNewConversation,
        updateMessages,
        updateTitle,
        openTabs,
        closeTab,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within a ChatProvider');
  return ctx;
}
