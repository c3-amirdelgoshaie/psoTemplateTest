import React from 'react';

/** Page-level section header (title + subtitle + optional action slot). */
export interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 16,
      }}
    >
      <div>
        <h1 className="hel-section-title">{title}</h1>
        {subtitle && <div className="hel-section-subtitle">{subtitle}</div>}
      </div>
      {action && <div>{action}</div>}
    </header>
  );
}

export default SectionHeader;
