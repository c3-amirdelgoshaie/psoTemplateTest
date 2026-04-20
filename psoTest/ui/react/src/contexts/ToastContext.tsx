/*
 * Toast notification context.
 *
 * Spec line 210 mandates toasts for: optimizer run complete, blend
 * constraint violation detected, vessel ETA within 6h of berth conflict.
 * Any component calls useToast().push({ kind, message }); toasts auto
 * dismiss after 5 seconds.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: number;
  kind: ToastKind;
  title?: string;
  message: string;
}

interface Ctx {
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
  toasts: Toast[];
}

const ToastContext = createContext<Ctx | undefined>(undefined);

let seq = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = seq++;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const value = useMemo<Ctx>(() => ({ push, dismiss, toasts }), [push, dismiss, toasts]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  useEffect(() => {
    // no-op
  }, [toasts]);
  return (
    <div className="hel-toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`hel-toast hel-toast--${t.kind}`}>
          {t.title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.title}</div>}
          <div>{t.message}</div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            style={{
              position: 'absolute',
              top: 4,
              right: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--hel-text-muted)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
