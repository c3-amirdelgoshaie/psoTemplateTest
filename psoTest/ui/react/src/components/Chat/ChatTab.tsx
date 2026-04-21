/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 *
 * ChatTab — self-contained chat conversation panel.
 *
 * Each instance owns its own fetch state, typewriter animation, and local
 * message buffer. The parent renders `<ChatTab key={conversationId} … />`
 * so React gives every conversation a fully independent component instance,
 * allowing multiple tabs to fetch answers in parallel without interfering
 * with each other.
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SendHorizonal, Square } from 'lucide-react';
import { useChat, type ChatMessage } from '../../contexts/ChatContext';
import { answerQuestion, type ChatHistoryEntry } from '../../data/psoAnalysisApi';

/* ── constants ─────────────────────────────────────────────────────── */

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

/* ── props ─────────────────────────────────────────────────────────── */

interface ChatTabProps {
  conversationId: string;
}

/* ── component ─────────────────────────────────────────────────────── */

export default function ChatTab({ conversationId }: ChatTabProps) {
  const { conversations, updateMessages, updateTitle } = useChat();

  /* ── local state (fully independent per instance) ────────────────── */
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const conv = conversations.find((c) => c.id === conversationId);
    return conv?.messages ?? [];
  });
  const [input, setInput] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rafRef = useRef<number | null>(null);
  const stopRef = useRef(false);
  const typingMsgRef = useRef<ChatMessage | undefined>(undefined);

  /* ── sync local messages back to context ─────────────────────────── */
  useEffect(() => {
    updateMessages(conversationId, messages);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── auto-scroll ─────────────────────────────────────────────────── */
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  /* ── cleanup on unmount ──────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      stopRef.current = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

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
        updateTitle(conversationId, question.length > 50 ? `${question.slice(0, 47)}...` : question);
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
    [isFetching, conversationId, messages, buildChatHistory, runTypewriter, updateTitle],
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

  /* ── render ──────────────────────────────────────────────────────── */

  return (
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
  );
}
