/*
 * Evidence Drawer — renders the full strict-JSON contract for a single
 * recommendation (spec lines 92-100 + 178-186).
 *
 * Accessible from the Dashboard (click a top-rec card) and the
 * Recommendations page (click a row or View button). Shows:
 *   - Decision + confidence + priority
 *   - Evidence bullets (3-6)
 *   - Assumptions (per Missing Data rules)
 *   - Risks
 *   - Next actions checklist
 *   - Reorder plan (when REORDER / SUBSTITUTE)
 *   - Risk flags + anomalies
 *   - Evidence metadata snapshot (data sources, timestamps, missing fields)
 *   - Accept / Reject / Modify buttons (feedback loop)
 */

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Drawer from './Drawer';
import HelButton from './HelButton';
import { DecisionBadge, PriorityBadge, StatusBadge } from './StatusBadge';
import {
  acceptRecommendation,
  addRecommendationNote,
  modifyRecommendation,
  rejectRecommendation,
} from '../../shared/crudeApi';
import { formatDateTime, formatKbbls, formatRelative, formatUsdCompact } from '../../lib/format';
import { useToast } from '../../contexts/ToastContext';
import type { PersistedRecommendation } from '../../types/crude';

export interface EvidenceDrawerProps {
  rec: PersistedRecommendation | null;
  onClose: () => void;
  readOnly?: boolean;
}

export default function EvidenceDrawer({ rec, onClose, readOnly }: EvidenceDrawerProps) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [note, setNote] = useState('');

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ['recs'] });
  };

  const accept = useMutation({
    mutationFn: () => acceptRecommendation(rec!.id, note),
    onSuccess: () => {
      push({ kind: 'success', title: 'Accepted', message: 'Recommendation accepted.' });
      refetchAll();
      onClose();
    },
  });
  const reject = useMutation({
    mutationFn: () => rejectRecommendation(rec!.id, note),
    onSuccess: () => {
      push({ kind: 'warning', title: 'Rejected', message: 'Recommendation rejected.' });
      refetchAll();
      onClose();
    },
  });
  const modify = useMutation({
    mutationFn: () => modifyRecommendation(rec!.id, { nextActions: rec!.nextActions }, note),
    onSuccess: () => {
      push({ kind: 'info', title: 'Modified', message: 'Recommendation marked modified.' });
      refetchAll();
      onClose();
    },
  });
  const addNote = useMutation({
    mutationFn: () => addRecommendationNote(rec!.id, note),
    onSuccess: () => {
      push({ kind: 'info', message: 'Note added.' });
      refetchAll();
      setNote('');
    },
  });

  if (!rec) return null;

  const canAct = !readOnly && rec.status === 'Proposed';

  return (
    <Drawer
      open={!!rec}
      onClose={onClose}
      title={rec.title}
      width={620}
      actions={
        canAct ? (
          <>
            <HelButton variant="secondary" onClick={() => addNote.mutate()} disabled={!note.trim()}>
              Add note
            </HelButton>
            <HelButton variant="ghost" onClick={() => modify.mutate()}>
              Modify
            </HelButton>
            <HelButton variant="destructive" onClick={() => reject.mutate()}>
              Reject
            </HelButton>
            <HelButton variant="primary" onClick={() => accept.mutate()}>
              Accept
            </HelButton>
          </>
        ) : (
          <HelButton variant="secondary" onClick={onClose}>
            Close
          </HelButton>
        )
      }
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <PriorityBadge priority={rec.priority} />
        <DecisionBadge decision={rec.decision} />
        <StatusBadge
          kind={
            rec.status === 'Accepted'
              ? 'success'
              : rec.status === 'Rejected'
                ? 'danger'
                : rec.status === 'Modified'
                  ? 'warning'
                  : 'info'
          }
        >
          {rec.status}
        </StatusBadge>
        <span style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
          Confidence {rec.confidence}%
        </span>
        {rec.expectedImpactUsd != null && (
          <span style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
            Expected impact {formatUsdCompact(rec.expectedImpactUsd)}
          </span>
        )}
      </div>

      {rec.summary && (
        <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>{rec.summary}</p>
      )}

      <Section title="Evidence" bullets={rec.evidence} />
      {rec.assumptions && rec.assumptions.length > 0 && (
        <Section title="Assumptions" bullets={rec.assumptions} tone="warning" />
      )}
      {rec.risks && rec.risks.length > 0 && (
        <Section title="Risks" bullets={rec.risks} tone="danger" />
      )}
      {rec.nextActions && rec.nextActions.length > 0 && (
        <Section title="Next actions" bullets={rec.nextActions} checklist />
      )}

      {rec.reorderPlan && (
        <div style={{ marginBottom: 16 }}>
          <h4 className="hel-card__title">Reorder / Substitution plan</h4>
          <div
            style={{
              background: 'var(--hel-surface-alt)',
              border: '1px solid var(--hel-border)',
              borderRadius: 8,
              padding: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
              fontSize: 13,
            }}
          >
            <KV k="Qty" v={`${rec.reorderPlan.totalQtyKbbls ?? 0} kbbls`} />
            <KV k="Grade" v={rec.reorderPlan.crudeGrade} />
            <KV k="Origin" v={rec.reorderPlan.originRegion ?? '—'} />
            <KV k="Order by" v={rec.reorderPlan.orderByDate} />
            <KV
              k="Arrival window"
              v={`${rec.reorderPlan.expectedArrivalWindowStart} → ${rec.reorderPlan.expectedArrivalWindowEnd}`}
            />
          </div>
        </div>
      )}

      {rec.riskFlags && rec.riskFlags.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 className="hel-card__title">Risk flags</h4>
          {rec.riskFlags.map((f, i) => (
            <div
              key={i}
              style={{
                border: '1px solid var(--hel-border)',
                borderLeft: '4px solid var(--hel-danger)',
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatusBadge kind="danger">{f.flagType}</StatusBadge>
                <span style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
                  Severity {f.severity}/5
                </span>
              </div>
              <div style={{ marginTop: 6 }}>{f.summary}</div>
              <div style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--hel-text-muted)' }}>
                Recommended: {f.recommendedAction}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <h4 className="hel-card__title">Evidence traceability</h4>
        <div style={{ fontSize: 12, color: 'var(--hel-text-muted)', lineHeight: 1.5 }}>
          {rec.metadata?.lpTargetVersion && (
            <div>LP target version: <strong>{String(rec.metadata.lpTargetVersion)}</strong></div>
          )}
          {Array.isArray(rec.metadata?.missingFields) && (rec.metadata!.missingFields as string[]).length > 0 && (
            <div style={{ color: 'var(--hel-warning)' }}>
              Missing data: {(rec.metadata!.missingFields as string[]).join(', ')}
            </div>
          )}
          {rec.metadata?.dataFreshness && typeof rec.metadata.dataFreshness === 'object' && (
            <ul style={{ margin: '4px 0 0 0', padding: 0, listStyle: 'none' }}>
              {Object.entries(rec.metadata.dataFreshness as Record<string, string>).map(([k, v]) => (
                <li key={k}>
                  {k}: {formatRelative(v)} ({formatDateTime(v)})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {rec.feedbackNotes && (
        <div style={{ marginBottom: 16 }}>
          <h4 className="hel-card__title">Feedback notes</h4>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: 'var(--hel-surface-alt)',
              border: '1px solid var(--hel-border)',
              borderRadius: 8,
              padding: 10,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            {rec.feedbackNotes}
          </pre>
        </div>
      )}

      {canAct && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="hel-rec-note" style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
            Note (optional)
          </label>
          <textarea
            id="hel-rec-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add context before accepting / rejecting…"
            style={{
              width: '100%',
              marginTop: 4,
              border: '1px solid var(--hel-border)',
              borderRadius: 8,
              padding: 8,
              fontSize: 13,
            }}
          />
        </div>
      )}
    </Drawer>
  );
}

function Section({
  title,
  bullets,
  tone,
  checklist,
}: {
  title: string;
  bullets: string[];
  tone?: 'warning' | 'danger';
  checklist?: boolean;
}) {
  if (!bullets?.length) return null;
  const toneColor =
    tone === 'warning' ? 'var(--hel-warning)' : tone === 'danger' ? 'var(--hel-danger)' : undefined;
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 className="hel-card__title">{title}</h4>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {bullets.map((b, i) => (
          <li
            key={i}
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              paddingLeft: 18,
              position: 'relative',
              marginBottom: 4,
              color: toneColor ?? 'var(--hel-text)',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 2,
                top: 6,
                width: 10,
                height: 10,
                border: `1.5px solid ${toneColor ?? 'var(--hel-primary)'}`,
                borderRadius: checklist ? 2 : 999,
                background: checklist ? 'transparent' : toneColor ?? 'var(--hel-primary)',
              }}
            />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--hel-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {k}
      </div>
      <div>{v}</div>
    </div>
  );
}

// Re-export formatKbbls so callers don't need a separate import.
export { formatKbbls };
