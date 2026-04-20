import React from 'react';

/**
 * The canonical card primitive for the Helleniq shell.
 *
 * Every page is built by arranging these cards in a CSS grid. Per spec
 * lines 11-14, layout patterns never change; only content inside cards
 * changes.
 */
export interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  flush?: boolean;
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Card({ title, subtitle, action, flush, compact, className, children }: CardProps) {
  const cls = [
    'hel-card',
    flush ? 'hel-card--flush' : '',
    compact ? 'hel-card--compact' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={cls}>
      {(title || subtitle || action) && (
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            {title && <h3 className="hel-card__title">{title}</h3>}
            {subtitle && (
              <div style={{ fontSize: 12, color: 'var(--hel-text-muted)', marginTop: -6 }}>{subtitle}</div>
            )}
          </div>
          {action && <div>{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export default Card;
