import React from 'react';
import type { CargoStatus, Priority } from '../../types/crude';

/**
 * Semantic status badge — pill shape per spec line 232.
 * Always paired with a text label (never color alone) for accessibility.
 */
export interface StatusBadgeProps {
  kind?:
    | 'confirmed'
    | 'provisional'
    | 'atrisk'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'muted';
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export function StatusBadge({ kind = 'muted', children, icon }: StatusBadgeProps) {
  return (
    <span className={`hel-badge hel-badge--${kind}`} role="status">
      {icon}
      {children}
    </span>
  );
}

export function CargoStatusBadge({ status }: { status: CargoStatus }) {
  const kind =
    status === 'Confirmed' ? 'confirmed' : status === 'Provisional' ? 'provisional' : 'atrisk';
  return <StatusBadge kind={kind as StatusBadgeProps['kind']}>{status}</StatusBadge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`hel-badge hel-priority--${priority}`}>{priority}</span>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  const kind: StatusBadgeProps['kind'] =
    decision === 'HOLD'
      ? 'success'
      : decision === 'DROP'
        ? 'muted'
        : decision === 'SUBSTITUTE' || decision === 'REORDER'
          ? 'info'
          : 'warning';
  return <StatusBadge kind={kind}>{decision}</StatusBadge>;
}

export default StatusBadge;
