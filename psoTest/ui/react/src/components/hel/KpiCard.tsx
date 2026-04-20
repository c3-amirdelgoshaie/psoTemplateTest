import React from 'react';

/**
 * KPI card — big serif number + label + optional delta indicator.
 * Spec line 231: 32px DM Serif Display; color varies by status.
 */
export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  deltaFormatter?: (d: number) => string;
  unit?: string;
  accent?: 'default' | 'success' | 'warning' | 'danger';
  small?: React.ReactNode;
}

const DEFAULT_DELTA = (d: number) => (d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2));

export function KpiCard({
  label,
  value,
  delta = null,
  deltaFormatter = DEFAULT_DELTA,
  unit,
  accent = 'default',
  small,
}: KpiCardProps) {
  const accentColor = {
    default: 'var(--hel-text)',
    success: 'var(--hel-success)',
    warning: 'var(--hel-warning)',
    danger: 'var(--hel-danger)',
  }[accent];

  const deltaClass =
    delta == null
      ? 'hel-kpi__delta--flat'
      : delta > 0
        ? 'hel-kpi__delta--up'
        : delta < 0
          ? 'hel-kpi__delta--down'
          : 'hel-kpi__delta--flat';

  return (
    <div className="hel-card" aria-label={label}>
      <div className="hel-kpi__label">{label}</div>
      <div className="hel-kpi__value" style={{ color: accentColor }}>
        {value}
        {unit && <span style={{ fontSize: 16, color: 'var(--hel-text-muted)', marginLeft: 4 }}>{unit}</span>}
      </div>
      {delta != null && (
        <div className={`hel-kpi__delta ${deltaClass}`}>
          {delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '• '}
          {deltaFormatter(delta)}
        </div>
      )}
      {small && <div style={{ fontSize: 12, color: 'var(--hel-text-muted)', marginTop: 4 }}>{small}</div>}
    </div>
  );
}

export default KpiCard;
