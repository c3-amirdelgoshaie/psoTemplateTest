/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 *
 * ChatSidebar — resizable right-hand panel with browser-style tabs.
 *
 * Layout (top → bottom):
 *   1. Header row  — "+" new-chat button, history toggle, close button
 *   2. Tab bar     — one tab per open conversation, click to switch, X to close
 *   3. Chat body   — delegated to <ChatTab key={id} /> for full isolation
 *
 * Each tab is rendered via `<ChatTab key={conversationId} />` so React gives
 * every conversation a completely independent component instance with its own
 * fetch state, typewriter animation, and local message buffer. This allows
 * asking questions in multiple tabs simultaneously.
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import {
  X,
  Plus,
  MessageCircle,
  History,
} from 'lucide-react';
import { useChat } from '../../contexts/ChatContext';
import ChatTab from './ChatTab';

/* ── constants ─────────────────────────────────────────────────────── */

const MIN_WIDTH = 340;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 420;

/* ── component ─────────────────────────────────────────────────────── */

export default function ChatSidebar() {
  const {
    isOpen,
    closeSidebar,
    conversations,
    activeConversationId,
    setActiveConversation,
    startNewConversation,
    openTabs,
    closeTab,
  } = useChat();

  /* ── sidebar width / resize ──────────────────────────────────────── */
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth)));
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  /* ── view mode ───────────────────────────────────────────────────── */
  const [view, setView] = useState<'tabs' | 'history'>('tabs');

  useEffect(() => {
    if (!isOpen) setView('tabs');
  }, [isOpen]);

  /* ── handlers ────────────────────────────────────────────────────── */

  const handleSelectFromHistory = (id: string) => {
    setActiveConversation(id);
    setView('tabs');
  };

  const handleNewChat = () => {
    startNewConversation();
    setView('tabs');
  };

  /* ── derived ─────────────────────────────────────────────────────── */

  const tabConversations = openTabs
    .map((id) => conversations.find((c) => c.id === id))
    .filter(Boolean) as typeof conversations;

  const showHistory = view === 'history' || (view === 'tabs' && openTabs.length === 0 && !activeConversationId);

  /* ── render ──────────────────────────────────────────────────────── */

  if (!isOpen) return null;

  return (
    <div
      ref={sidebarRef}
      className="fixed top-0 right-0 h-full flex flex-row border-l border-weak bg-primary overflow-hidden shadow-xl z-40"
      style={{ width }}
    >
      {/* Drag handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/30 active:bg-accent/40 z-30 transition-colors"
        onMouseDown={onMouseDown}
        aria-label="Resize chat panel"
        tabIndex={0}
        role="slider"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 pl-1.5 overflow-hidden">

        {/* ── Header row ──────────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-weak flex-shrink-0">
          <button
            type="button"
            onClick={handleNewChat}
            className="p-1.5 rounded hover:bg-secondary text-secondary hover:text-primary transition-colors"
            aria-label="New chat"
            title="New chat"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => setView(view === 'history' ? 'tabs' : 'history')}
            className={`p-1.5 rounded transition-colors ${
              showHistory
                ? 'bg-secondary text-primary'
                : 'text-secondary hover:bg-secondary hover:text-primary'
            }`}
            aria-label="Chat history"
            title="Chat history"
          >
            <History size={15} />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={closeSidebar}
            className="p-1.5 rounded hover:bg-secondary text-secondary hover:text-primary transition-colors"
            aria-label="Close chat"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────── */}
        {!showHistory && tabConversations.length > 0 && (
          <div
            className="flex items-stretch border-b border-weak flex-shrink-0 overflow-x-auto"
            role="tablist"
            aria-label="Open chat tabs"
          >
            {tabConversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  role="tab"
                  aria-selected={isActive}
                  className={`group flex items-center gap-1 min-w-0 max-w-[160px] px-2.5 py-1.5 text-xs cursor-pointer border-r border-weak transition-colors ${
                    isActive
                      ? 'bg-primary text-primary border-b-2 border-b-accent'
                      : 'bg-secondary/50 text-secondary hover:bg-secondary hover:text-primary'
                  }`}
                  onClick={() => {
                    setActiveConversation(conv.id);
                    setView('tabs');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveConversation(conv.id);
                      setView('tabs');
                    }
                  }}
                  tabIndex={0}
                >
                  <span className="truncate flex-1">{conv.title}</span>
                  <button
                    type="button"
                    className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary transition-opacity"
                    aria-label={`Close ${conv.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(conv.id);
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Body ────────────────────────────────────────────────── */}
        {showHistory ? (
          /* ── History list ──────────────────────────────────────── */
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-secondary px-4">
                <MessageCircle size={32} className="mb-3 opacity-50" />
                <p className="text-sm text-center mb-4">No conversations yet</p>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="text-sm px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
                >
                  Start a new chat
                </button>
              </div>
            ) : (
              <ul className="py-1">
                {conversations.map((conv) => {
                  const isTabbed = openTabs.includes(conv.id);
                  return (
                    <li key={conv.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectFromHistory(conv.id)}
                        className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-secondary transition-colors ${
                          conv.id === activeConversationId ? 'bg-secondary' : ''
                        }`}
                      >
                        <MessageCircle
                          size={14}
                          className="mt-0.5 flex-shrink-0 text-secondary"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-primary truncate font-medium">
                            {conv.title}
                          </p>
                          <p className="text-xs text-secondary mt-0.5">
                            {conv.messages.length === 0
                              ? 'Empty'
                              : `${Math.floor(conv.messages.length / 2)} message${Math.floor(conv.messages.length / 2) !== 1 ? 's' : ''}`}
                            {' \u00b7 '}
                            {new Date(conv.createdAt).toLocaleDateString()}
                            {isTabbed && (
                              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle" title="Open in tab" />
                            )}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : activeConversationId ? (
          /* ── Active chat — keyed so each conversation gets its own instance ── */
          <ChatTab key={activeConversationId} conversationId={activeConversationId} />
        ) : (
          /* ── No active tab ────────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center text-secondary px-4">
            <MessageCircle size={32} className="mb-3 opacity-50" />
            <p className="text-sm text-center mb-4">No open chats</p>
            <button
              type="button"
              onClick={handleNewChat}
              className="text-sm px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              Start a new chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
