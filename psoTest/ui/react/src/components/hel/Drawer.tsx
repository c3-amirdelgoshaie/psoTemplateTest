import React from 'react';

/** Slide-in drawer used by the Evidence drawer and Cargo Detail panel. */
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  width?: number;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function Drawer({ open, onClose, title, children, actions, width = 520 }: DrawerProps) {
  if (!open) return null;
  return (
    <>
      <div
        className="hel-drawer-backdrop"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="button"
        tabIndex={-1}
        aria-label="Close drawer"
      />
      <aside className="hel-drawer" style={{ width }} role="dialog" aria-modal="true">
        <div className="hel-drawer__header">
          <div className="hel-card__title" style={{ margin: 0 }}>
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: 'var(--hel-text-muted)',
            }}
          >
            ×
          </button>
        </div>
        <div className="hel-drawer__body">{children}</div>
        {actions && (
          <footer
            style={{
              padding: 12,
              borderTop: '1px solid var(--hel-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            {actions}
          </footer>
        )}
      </aside>
    </>
  );
}

export default Drawer;
