/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 *
 * ChatPage — natural-language Q&A interface for the PSO application.
 *
 * Responses are typewriter-animated: the full answer arrives from Bedrock
 * then renders character-by-character so the user sees text appearing
 * progressively rather than a long blank wait followed by a wall of text.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SendHorizonal, Square } from 'lucide-react';
import { answerQuestion, type ChatHistoryEntry } from '../../data/psoAnalysisApi';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Full final content, set once fetch resolves; drives the typewriter. */
  fullContent?: string;
  isTyping?: boolean;
}

// How many characters to reveal per animation frame (~60 fps → very fast typewriter)
const CHARS_PER_FRAME = 8;

const SUGGESTED_QUESTIONS = [
  'Which vessel is at risk and what is our demurrage exposure?',
  'What is the current tank inventory? Are any tanks near capacity or critically low?',
  'Compare the Urals Substitution and Vessel Re-timing scenarios — which should I implement?',
  'What is the annualized GRM uplift from the Urals Substitution scenario?',
  'What crude grades are incoming by vessel and in what volumes?',
  'Show me the CDU throughput and quality constraints — which are OK and which are flagged?',
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

export default function ChatPage() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const rafRef       = useRef<number | null>(null);
  const stopRef      = useRef(false);   // set to true to abort the typewriter mid-run
  const typingMsgRef = useRef<Message | undefined>(undefined); // always-current typing state

  // Auto-scroll whenever content changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cancel any running animation on unmount
  useEffect(() => {
    return () => {
      stopRef.current = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /** Animate `fullContent` onto the message identified by `id`, char by char. */
  const runTypewriter = useCallback((id: string, fullContent: string) => {
    stopRef.current = false;
    let pos = 0;

    const tick = () => {
      if (stopRef.current) return;

      pos = Math.min(pos + CHARS_PER_FRAME, fullContent.length);
      const slice = fullContent.slice(0, pos);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, content: slice, isTyping: pos < fullContent.length }
            : m,
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

  /** Stop the current typewriter and snap to the full text immediately. */
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

  const buildChatHistory = useCallback((msgs: Message[]): ChatHistoryEntry[] => {
    const pairs: ChatHistoryEntry[] = [];
    for (let i = 0; i + 1 < msgs.length; i += 2) {
      const u = msgs[i];
      const a = msgs[i + 1];
      // Only include pairs where the assistant message is fully settled —
      // not still fetching (no fullContent) and not still animating (isTyping).
      if (
        u?.role === 'user' &&
        a?.role === 'assistant' &&
        !a.isTyping &&
        !a.fullContent &&
        a.content
      ) {
        pairs.push({ question: u.content, answer: a.content });
      }
    }
    return pairs.slice(-5);
  }, []);

  const sendMessage = useCallback(
    async (question: string) => {
      // Block if already fetching OR if typewriter is still animating — either way
      // the conversation isn't in a stable state to accept a new message.
      if (!question.trim() || isFetching || !!typingMsgRef.current) return;
      setError(null);

      const history = buildChatHistory(messages);
      const placeholderId = `${Date.now()}-a`;

      const userMsg: Message  = { id: `${Date.now()}-u`, role: 'user',      content: question };
      const placeholder: Message = { id: placeholderId,  role: 'assistant', content: '', isTyping: true };

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setInput('');
      setIsFetching(true);

      try {
        const answer = await answerQuestion(question, history);
        // Swap placeholder content to empty string, mark as fetched, then typewrite
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
    [isFetching, messages, buildChatHistory, runTypewriter],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Find the currently-typing message (if any) so we can show skip button.
  // Also keep a ref in sync so the sendMessage callback can always read the
  // current value without going stale inside its closure.
  const typingMsg = messages.find((m) => m.isTyping && m.fullContent);
  typingMsgRef.current = typingMsg;

  const isbusy = isFetching || !!typingMsg;

  return (
    <div className="h-full flex flex-col max-h-[calc(100vh-theme(spacing.16))]">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <h1 className="text-xl font-semibold text-primary">Ask about your data</h1>
        <p className="text-sm text-secondary mt-0.5">
          Ask natural-language questions about scenarios, KPIs, cargo schedules, and more.
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-weak bg-primary p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center pt-6">
            <p className="text-secondary text-sm mb-4">Try one of these questions or type your own:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="text-left px-3 py-2 rounded-lg border border-weak hover:bg-secondary text-sm text-secondary hover:text-primary transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-2xl rounded-lg px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent text-white'
                  : 'bg-secondary text-primary border border-weak'
              }`}
            >
              {/* Waiting for fetch to resolve */}
              {msg.isTyping && !msg.fullContent && (
                <span className="inline-flex gap-1 items-center text-secondary">
                  <span className="animate-bounce [animation-delay:0ms]">●</span>
                  <span className="animate-bounce [animation-delay:150ms]">●</span>
                  <span className="animate-bounce [animation-delay:300ms]">●</span>
                </span>
              )}

              {/* Typewriting or finished */}
              {(msg.content || (msg.isTyping && msg.fullContent)) && (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                  {msg.content}
                </ReactMarkdown>
              )}

              {/* Blinking cursor during typewriter */}
              {msg.isTyping && msg.fullContent && (
                <span className="inline-block w-0.5 h-4 bg-current align-middle ml-0.5 animate-pulse" />
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 mt-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 mt-3 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          className="flex-1 resize-none rounded-lg border border-weak bg-secondary text-primary placeholder-secondary p-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          rows={2}
          placeholder="Ask a question about your PSO data… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isbusy}
        />
        {/* While typing animation is running: show Stop button to skip to end */}
        {typingMsg ? (
          <button
            type="button"
            onClick={() => skipAnimation(typingMsg.id, typingMsg.fullContent!)}
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg border border-weak text-secondary hover:text-primary transition-colors"
            aria-label="Skip to end of response"
            title="Skip to end"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={isFetching || !input.trim()}
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-accent text-white disabled:opacity-40 transition-opacity"
            aria-label="Send message"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
