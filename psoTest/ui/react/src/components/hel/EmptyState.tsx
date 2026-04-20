import React from 'react';

/** Simple empty-state primitive used when a filter returns zero rows. */
export interface EmptyStateProps {
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: '40px 24px',
        textAlign: 'center',
        color: 'var(--hel-text-muted)',
      }}
    >
      <div
        style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}
      >
        {title}
      </div>
      {message && <div style={{ fontSize: 13, marginBottom: 12 }}>{message}</div>}
      {action}
    </div>
  );
}

export default EmptyState;
