/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 *
 * ChatSidebar — resizable right-hand panel with browser-style tabs.
 *
 * Layout (top → bottom):
 *   1. Header row  — "+" new-chat button, history toggle, close button
 *   2. Tab bar     — one tab per open conversation, click to switch, X to close
 *   3. Chat body   — messages + input for the active tab
 *
 * When no tabs are open the body shows the conversation history list instead.
 * The left edge of the sidebar is draggable to resize.
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X,
  Plus,
  SendHorizonal,
  Square,
  MessageCircle,
  History,
} from 'lucide-react';
import { useChat, type ChatMessage } from '../../contexts/ChatContext';
import { answerQuestion, type ChatHistoryEntry } from '../../data/psoAnalysisApi';

/* ── constants ─────────────────────────────────────────────────────── */

const MIN_WIDTH = 340;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 420;
const CHARS_PER_FRAME = 8;

const SUGGESTED_QUESTIONS = [
  'Which vessel is at risk and what is our demurrage exposure?',
  'What is the current tank inventory?',
  'Compare the Urals Substitution and Vessel Re-timing scenarios.',
  'What crude grades are incoming by vessel?',
];

const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-weak px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-weak px-2 py-1">{children}</td>,
};

/* ── component ─────────────────────────────────────────────────────── */

export default function ChatSidebar() {
  const {
    isOpen,
    closeSidebar,
    conversations,
    activeConversationId,
    setActiveConversation,
    startNewConversation,
    updateMessages,
    updateTitle,
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
  // 'tabs' = normal view (tab bar + active chat), 'history' = browsing all past chats
  const [view, setView] = useState<'tabs' | 'history'>('tabs');

  // Reset to tabs view when sidebar closes
  useEffect(() => {
    if (!isOpen) setView('tabs');
  }, [isOpen]);

  /* ── local message state for the active chat ─────────────────────── */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rafRef = useRef<number | null>(null);
  const stopRef = useRef(false);
  const typingMsgRef = useRef<ChatMessage | undefined>(undefined);

  // When active conversation changes, load its messages into local state
  useEffect(() => {
    const conv = conversations.find((c) => c.id === activeConversationId);
    setMessages(conv?.messages ?? []);
    setInput('');
    setError(null);
    stopRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local messages back to context
  useEffect(() => {
    if (activeConversationId) {
      updateMessages(activeConversationId, messages);
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll — use scrollTop on the container instead of scrollIntoView
  // to prevent ancestor containers (including the page) from scrolling.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRef.current = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ── handlers ────────────────────────────────────────────────────── */

  const handleSelectFromHistory = (id: string) => {
    setActiveConversation(id);   // also adds to openTabs
    setView('tabs');
  };

  const handleNewChat = () => {
    startNewConversation();
    setView('tabs');
  };

  /* ── typewriter ──────────────────────────────────────────────────── */

  const runTypewriter = useCallback((id: string, fullContent: string) => {
    stopRef.current = false;
    let pos = 0;
    const tick = () => {
      if (stopRef.current) return;
      pos = Math.min(pos + CHARS_PER_FRAME, fullContent.length);
      const slice = fullContent.slice(0, pos);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, content: slice, isTyping: pos < fullContent.length } : m,
        ),
      );
      if (pos < fullContent.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        textareaRef.current?.focus();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const skipAnimation = useCallback((id: string, fullContent: string) => {
    stopRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: fullContent, isTyping: false } : m)),
    );
  }, []);

  /* ── send ─────────────────────────────────────────────────────────── */

  const buildChatHistory = useCallback((msgs: ChatMessage[]): ChatHistoryEntry[] => {
    const pairs: ChatHistoryEntry[] = [];
    for (let i = 0; i + 1 < msgs.length; i += 2) {
      const u = msgs[i];
      const a = msgs[i + 1];
      if (u?.role === 'user' && a?.role === 'assistant' && !a.isTyping && a.content) {
        pairs.push({ question: u.content, answer: a.content });
      }
    }
    return pairs.slice(-5);
  }, []);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || isFetching || !!typingMsgRef.current) return;

      let convId = activeConversationId;
      if (!convId) {
        convId = startNewConversation();
        setView('tabs');
      }

      setError(null);
      const history = buildChatHistory(messages);
      const placeholderId = `${Date.now()}-a`;

      const userMsg: ChatMessage = { id: `${Date.now()}-u`, role: 'user', content: question };
      const placeholder: ChatMessage = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        isTyping: true,
      };

      setMessages((prev) => [...prev, userMsg, placeholder]);

      if (messages.length === 0) {
        updateTitle(convId, question.length > 50 ? `${question.slice(0, 47)}...` : question);
      }

      setInput('');
      setIsFetching(true);

      try {
        const answer = await answerQuestion(question, history);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? { ...m, content: '', fullContent: answer, isTyping: true }
              : m,
          ),
        );
        runTypewriter(placeholderId, answer);
      } catch (e: unknown) {
        const errMsg = typeof e === 'string' ? e : 'Something went wrong. Please try again.';
        setError(errMsg);
        setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
        textareaRef.current?.focus();
      } finally {
        setIsFetching(false);
      }
    },
    [isFetching, activeConversationId, messages, buildChatHistory, runTypewriter, updateTitle, startNewConversation],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const typingMsg = messages.find((m) => m.isTyping && m.fullContent);
  typingMsgRef.current = typingMsg;
  const isBusy = isFetching || !!typingMsg;

  /* ── derived ─────────────────────────────────────────────────────── */

  // Resolve tab ids to conversation objects (preserving tab order)
  const tabConversations = openTabs
    .map((id) => conversations.find((c) => c.id === id))
    .filter(Boolean) as typeof conversations;

  const showHistory = view === 'history' || (view === 'tabs' && openTabs.length === 0 && !activeConversationId);

  /* ── render ──────────────────────────────────────────────────────── */

  if (!isOpen) return null;

  return (
    <div
      ref={sidebarRef}
      className="flex-shrink-0 h-full flex flex-row border-l border-weak bg-primary relative overflow-hidden"
      style={{ width, maxHeight: '100%' }}
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

        {/* ── Tab bar (only when there are open tabs and not in history view) ── */}
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
          /* ── Active chat ──────────────────────────────────────── */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Message list */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col items-center pt-4">
                  <p className="text-secondary text-xs mb-3">
                    Try a question or type your own:
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 w-full">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendMessage(q)}
                        className="text-left px-2.5 py-2 rounded-lg border border-weak hover:bg-secondary text-xs text-secondary hover:text-primary transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed overflow-hidden ${
                      msg.role === 'user'
                        ? 'bg-accent text-white'
                        : 'bg-secondary text-primary border border-weak'
                    }`}
                  >
                    {msg.isTyping && !msg.fullContent && (
                      <span className="inline-flex gap-1 items-center text-secondary">
                        <span className="animate-bounce [animation-delay:0ms]">●</span>
                        <span className="animate-bounce [animation-delay:150ms]">●</span>
                        <span className="animate-bounce [animation-delay:300ms]">●</span>
                      </span>
                    )}

                    {(msg.content || (msg.isTyping && msg.fullContent)) && (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                        {msg.content}
                      </ReactMarkdown>
                    )}

                    {msg.isTyping && msg.fullContent && (
                      <span className="inline-block w-0.5 h-3 bg-current align-middle ml-0.5 animate-pulse" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Error banner */}
            {error && (
              <div className="flex-shrink-0 mx-3 mb-1 px-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Input area */}
            <div className="flex-shrink-0 p-3 pt-1 flex gap-2 items-end border-t border-weak">
              <textarea
                ref={textareaRef}
                className="flex-1 resize-none rounded-lg border border-weak bg-secondary text-primary placeholder-secondary p-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                rows={2}
                placeholder="Ask a question... (Enter to send)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isBusy}
              />
              {typingMsg ? (
                <button
                  type="button"
                  onClick={() => skipAnimation(typingMsg.id, typingMsg.fullContent!)}
                  className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-weak text-secondary hover:text-primary transition-colors"
                  aria-label="Skip to end of response"
                  title="Skip to end"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sendMessage(input)}
                  disabled={isFetching || !input.trim()}
                  className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-accent text-white disabled:opacity-40 transition-opacity"
                  aria-label="Send message"
                >
                  <SendHorizonal className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── No active tab, show prompt ───────────────────────── */
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
