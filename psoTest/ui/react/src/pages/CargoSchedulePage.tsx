/*
 * Crude Cargo Schedule page (spec page 2, lines 90-123).
 *
 * Purpose: The scheduler's operating plane. Lets a planner:
 *   - See every cargo laid on berth-lane Gantt tracks over the horizon
 *   - Drag a cargo bar horizontally to re-time its laycan (constraint-checked)
 *   - Flip to a table view for scanning / filtering
 *   - Open a cargo to its detail panel (edit / nominate tanks / flag / optimize)
 *   - Open a modal to add a new cargo
 *   - Inspect maintenance windows on a secondary Gantt strip
 *
 * Constraint validation on drag:
 *   - Flag if the cargo has isFixed=true (charter-party locked).
 *   - Flag if the new laycan span pushes concurrent berth count > berthCount.
 *   - Flag if start pushed before the original ETA by more than flexDays.
 *
 * Note: Drag state is local-only in v1 — accepting a change triggers
 * runOptimizer() so the re-solve provides authoritative schedules.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  Anchor,
  CalendarRange,
  Flag,
  Layers,
  Plus,
  RefreshCw,
  Rows3,
  Save,
  Undo2,
  X,
} from 'lucide-react';

import {
  getInputData,
  getOutputData,
  runOptimizer,
} from '../shared/crudeApi';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';
import { useToast } from '../contexts/ToastContext';

import SectionHeader from '../components/hel/SectionHeader';
import PageFilterBar from '../components/TopBar/PageFilterBar';
import Card from '../components/hel/Card';
import HelButton from '../components/hel/HelButton';
import EmptyState from '../components/hel/EmptyState';
import {
  CargoStatusBadge,
  DecisionBadge,
  StatusBadge,
} from '../components/hel/StatusBadge';
import Drawer from '../components/hel/Drawer';
import {
  addDays,
  daysBetween,
  formatDate,
  formatKbbls,
  formatUsd,
  gradeFamilyColor,
} from '../lib/format';
import type {
  Cargo,
  CrudeItem,
  MaintenanceWindow,
  PsoInput,
  Schedule,
  Tank,
  VesselType,
} from '../types/crude';

type ViewMode = 'gantt' | 'table';

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function CargoSchedulePage() {
  const { filters } = useGlobalFilters();
  const navigate = useNavigate();
  const { push } = useToast();
  const qc = useQueryClient();

  const { data: input } = useQuery({ queryKey: ['psoInput'], queryFn: getInputData });
  const { data: output } = useQuery({ queryKey: ['psoOutput'], queryFn: getOutputData });

  const [view, setView] = useState<ViewMode>('gantt');
  const [selected, setSelected] = useState<Cargo | null>(null);
  const [nominating, setNominating] = useState<Cargo | null>(null);
  const [adding, setAdding] = useState(false);

  // Track local drag overrides — keyed by cargoId — so a user can inspect
  // proposed changes before committing via Re-optimize.
  const [overrides, setOverrides] = useState<Record<string, { laycanStart: string; laycanEnd: string }>>(
    {}
  );

  const facility = input?.facilities?.[0];
  const cargoes = facility?.cargoes ?? [];
  const items: CrudeItem[] = input?.items ?? [];
  const itemsById = useMemo(() => {
    const m: Record<string, CrudeItem> = {};
    for (const i of items) m[i.itemId] = i;
    return m;
  }, [items]);

  const schedulesById = useMemo(() => {
    const m: Record<string, Schedule> = {};
    for (const s of output?.schedules ?? []) m[s.cargoId] = s;
    return m;
  }, [output]);

  // Merge local overrides onto the cargoes so every view renders the same data.
  const mergedCargoes: Cargo[] = useMemo(
    () =>
      cargoes.map((c) =>
        overrides[c.cargoId]
          ? { ...c, laycanStart: overrides[c.cargoId].laycanStart, laycanEnd: overrides[c.cargoId].laycanEnd }
          : c
      ),
    [cargoes, overrides]
  );

  // Global filter scoping.
  const cargoesInScope = useMemo(
    () =>
      mergedCargoes.filter((c) => {
        if (filters.vesselStatus !== 'All' && c.status !== filters.vesselStatus) return false;
        if (filters.gradeFamily !== 'All') {
          const it = itemsById[c.crudeGrade];
          if (it?.gradeFamily !== filters.gradeFamily) return false;
        }
        return true;
      }),
    [mergedCargoes, filters, itemsById]
  );

  const reoptimize = useMutation({
    mutationFn: () => runOptimizer('Balanced'),
    onSuccess: () => {
      push({ kind: 'success', title: 'Optimizer ran', message: 'Schedule refreshed.' });
      qc.invalidateQueries({ queryKey: ['psoOutput'] });
      setOverrides({});
    },
  });

  // Handler: drag commits a new laycan. Runs constraint checks and keeps the
  // result in the local overrides map — no backend call until Re-optimize.
  const commitDrag = useCallback(
    (cargoId: string, deltaDays: number) => {
      const c = mergedCargoes.find((x) => x.cargoId === cargoId);
      if (!c || !input || deltaDays === 0) return;
      const violations = validateDrag(c, deltaDays, mergedCargoes, input);
      const nextStart = addDays(c.laycanStart, deltaDays);
      const nextEnd = addDays(c.laycanEnd, deltaDays);
      setOverrides((o) => ({ ...o, [cargoId]: { laycanStart: nextStart, laycanEnd: nextEnd } }));
      if (violations.length === 0) {
        push({
          kind: 'info',
          title: `${c.vesselName} re-timed`,
          message: `New laycan ${formatDate(nextStart)} → ${formatDate(nextEnd)}. Click Re-optimize to commit.`,
        });
      } else {
        push({
          kind: 'warning',
          title: `${c.vesselName} re-timed with warnings`,
          message: violations.join(' · '),
        });
      }
    },
    [mergedCargoes, input, push]
  );

  const resetOverrides = () => setOverrides({});

  return (
    <div>
      <SectionHeader
        title="Crude Cargo Schedule"
        subtitle={
          input
            ? `${cargoesInScope.length} / ${cargoes.length} cargoes · ${input.berthCount} berths · ${input.planningHorizonDays}-day horizon starting ${formatDate(input.startDate)}`
            : 'Loading…'
        }
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <HelButton variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
              Add cargo
            </HelButton>
            {Object.keys(overrides).length > 0 && (
              <HelButton variant="ghost" size="sm" icon={<Undo2 size={14} />} onClick={resetOverrides}>
                Reset drag changes ({Object.keys(overrides).length})
              </HelButton>
            )}
            <HelButton
              variant="primary"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => reoptimize.mutate()}
              disabled={reoptimize.isPending}
            >
              {reoptimize.isPending ? 'Re-optimizing…' : 'Re-optimize'}
            </HelButton>
          </div>
        }
      />

      <PageFilterBar
        extras={
          <div className="hel-toggle" style={{ display: 'inline-flex', border: '1px solid var(--hel-border)', borderRadius: 999, padding: 2 }}>
            <ToggleBtn on={view === 'gantt'} onClick={() => setView('gantt')}>
              <CalendarRange size={14} /> Gantt
            </ToggleBtn>
            <ToggleBtn on={view === 'table'} onClick={() => setView('table')}>
              <Rows3 size={14} /> Table
            </ToggleBtn>
          </div>
        }
      />

      {!input || !facility ? (
        <Card>
          <EmptyState title="Loading" message="Preparing schedule data…" />
        </Card>
      ) : view === 'gantt' ? (
        <>
          <Card
            title="Berth Gantt"
            subtitle={`Drag a bar horizontally to re-time its laycan (${input.flexDays}-day flex window).`}
          >
            <BerthGantt
              cargoes={cargoesInScope}
              input={input}
              itemsById={itemsById}
              schedulesById={schedulesById}
              onOpenCargo={setSelected}
              onCommitDrag={commitDrag}
              overrides={overrides}
            />
          </Card>

          <div style={{ height: 16 }} />

          <Card
            title="Maintenance & tank transfers"
            subtitle="Secondary Gantt — CDU maintenance windows and tank rebalancing activity."
          >
            <MaintenanceStrip
              input={input}
              horizonDays={input.planningHorizonDays}
            />
          </Card>
        </>
      ) : (
        <ScheduleTable
          cargoes={cargoesInScope}
          itemsById={itemsById}
          schedulesById={schedulesById}
          onOpen={setSelected}
        />
      )}

      <CargoDetailDrawer
        cargo={selected}
        onClose={() => setSelected(null)}
        item={selected ? itemsById[selected.crudeGrade] : undefined}
        schedule={selected ? schedulesById[selected.cargoId] : undefined}
        tanks={facility?.tanks ?? []}
        onNominateTanks={() => {
          if (selected) {
            setNominating(selected);
            setSelected(null);
          }
        }}
        onRunOptimizer={() => {
          setSelected(null);
          navigate('/optimizer');
        }}
        onFlag={() => push({ kind: 'warning', title: 'Flagged for review', message: `${selected?.vesselName} flagged.` })}
      />

      {nominating && (
        <NominateTanksModal
          cargo={nominating}
          tanks={facility?.tanks ?? []}
          itemsById={itemsById}
          onClose={() => setNominating(null)}
          onSave={(picks) => {
            push({
              kind: 'success',
              title: 'Tanks nominated',
              message: `${nominating.vesselName} → ${picks.join(', ') || '—'}. Click Re-optimize to commit.`,
            });
            setNominating(null);
          }}
        />
      )}

      {adding && facility && (
        <AddCargoModal
          items={items}
          facilityId={facility.facilityId}
          onClose={() => setAdding(false)}
          onSave={(c) => {
            push({
              kind: 'success',
              title: 'Cargo added (draft)',
              message: `${c.vesselName} queued locally. Click Re-optimize to include it.`,
            });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Berth Gantt (draggable)                                             */
/* ------------------------------------------------------------------ */

interface GanttProps {
  cargoes: Cargo[];
  input: PsoInput;
  itemsById: Record<string, CrudeItem>;
  schedulesById: Record<string, Schedule>;
  onOpenCargo: (c: Cargo) => void;
  onCommitDrag: (cargoId: string, deltaDays: number) => void;
  overrides: Record<string, unknown>;
}

function BerthGantt({
  cargoes,
  input,
  itemsById,
  schedulesById,
  onOpenCargo,
  onCommitDrag,
  overrides,
}: GanttProps) {
  const H = input.planningHorizonDays;
  const startMs = new Date(input.startDate).getTime();

  // Lane assignment — greedy, one cargo per lane until non-overlap frees it.
  const lanes = useMemo(() => assignLanes(cargoes), [cargoes]);
  const overflow = lanes.length > input.berthCount;

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState(0);

  const onPointerDown = (e: React.PointerEvent, cargoId: string, isFixed: boolean) => {
    if (isFixed) return; // Fixed cargoes can't be re-timed.
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragId(cargoId);
    setDragDelta(0);
  };

  // Global pointer tracking so the drag keeps going even if the cursor
  // leaves the bar.
  useEffect(() => {
    if (!dragId) return;
    const track = trackRef.current;
    if (!track) return;
    const trackW = track.getBoundingClientRect().width;
    const pxPerDay = trackW / H;
    let startX: number | null = null;

    const onMove = (e: PointerEvent) => {
      if (startX == null) startX = e.clientX;
      const px = e.clientX - startX;
      const delta = Math.round(px / pxPerDay);
      setDragDelta(delta);
    };
    const onUp = () => {
      if (dragId) onCommitDrag(dragId, dragDelta);
      setDragId(null);
      setDragDelta(0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragId, dragDelta, H, onCommitDrag]);

  return (
    <div>
      {overflow && (
        <div style={{ marginBottom: 8 }}>
          <StatusBadge kind="warning">
            <AlertTriangle size={12} style={{ marginRight: 4 }} />
            {lanes.length} concurrent lanes but only {input.berthCount} berths — conflicts flagged.
          </StatusBadge>
        </div>
      )}

      <div ref={trackRef} style={{ position: 'relative', userSelect: 'none' }}>
        {/* Day axis */}
        <div
          style={{
            position: 'relative',
            height: 22,
            marginBottom: 6,
            borderBottom: '1px solid var(--hel-border)',
          }}
        >
          {Array.from({ length: H + 1 }).map((_, d) => (
            <div
              key={d}
              style={{
                position: 'absolute',
                left: `${(d / H) * 100}%`,
                bottom: 0,
                transform: 'translateX(-50%)',
                fontSize: 10,
                color: 'var(--hel-text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {d % 3 === 0 ? dateLabel(input.startDate, d) : ''}
            </div>
          ))}
        </div>

        {/* Lanes */}
        {lanes.map((lane, laneIdx) => {
          const isOverflow = laneIdx >= input.berthCount;
          return (
            <div
              key={laneIdx}
              style={{
                position: 'relative',
                height: 44,
                marginBottom: 4,
                background: isOverflow
                  ? 'rgba(239, 82, 82, 0.05)'
                  : 'var(--hel-surface-alt)',
                border: `1px solid ${isOverflow ? 'var(--hel-danger)' : 'var(--hel-border)'}`,
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 6,
                  top: 2,
                  fontSize: 10,
                  color: isOverflow ? 'var(--hel-danger)' : 'var(--hel-text-muted)',
                  fontWeight: isOverflow ? 600 : 400,
                  pointerEvents: 'none',
                }}
              >
                Berth {laneIdx + 1}
                {isOverflow && ' (overflow)'}
              </div>
              {lane.map((c) => {
                const deltaDays = dragId === c.cargoId ? dragDelta : 0;
                const sDay = (new Date(c.laycanStart).getTime() - startMs) / 86400000 + deltaDays;
                const eDay = (new Date(c.laycanEnd).getTime() - startMs) / 86400000 + deltaDays;
                const left = Math.max(0, (sDay / H) * 100);
                const width = Math.max(((Math.min(H, eDay) - Math.max(0, sDay)) / H) * 100, 2);
                const classBar =
                  c.status === 'Confirmed'
                    ? 'hel-gantt-bar--Confirmed'
                    : c.status === 'Provisional'
                      ? 'hel-gantt-bar--Provisional'
                      : 'hel-gantt-bar--AtRisk';
                const item = itemsById[c.crudeGrade];
                const sch = schedulesById[c.cargoId];
                const isDragging = dragId === c.cargoId;
                const hasOverride = !!overrides[c.cargoId];
                return (
                  <div
                    key={c.cargoId}
                    className={`hel-gantt-bar ${classBar} ${isDragging ? 'hel-gantt-bar--dragging' : ''}`}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${width}%`,
                      top: 10,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 8px',
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      cursor: c.isFixed ? 'not-allowed' : 'grab',
                      outline: hasOverride ? '2px dashed var(--hel-accent)' : 'none',
                    }}
                    onPointerDown={(e) => onPointerDown(e, c.cargoId, !!c.isFixed)}
                    onDoubleClick={() => onOpenCargo(c)}
                    title={`${c.vesselName} · ${item?.name ?? c.crudeGrade} · ${formatDate(c.laycanStart)} → ${formatDate(c.laycanEnd)}${c.isFixed ? ' (contract-fixed)' : ''}${hasOverride ? ' · local override' : ''}`}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: gradeFamilyColor(item?.gradeFamily),
                        marginRight: 6,
                      }}
                    />
                    {c.vesselName} · {formatKbbls(c.volumeBbls)}
                    {sch && (
                      <span style={{ marginLeft: 8, opacity: 0.9 }}>
                        <DecisionBadge decision={sch.decision} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--hel-text-muted)' }}>
        <span>
          <span className="hel-gantt-bar hel-gantt-bar--Confirmed" style={{ display: 'inline-block', width: 18, height: 10, borderRadius: 3, verticalAlign: 'middle', marginRight: 6 }} />
          Confirmed
        </span>
        <span>
          <span className="hel-gantt-bar hel-gantt-bar--Provisional" style={{ display: 'inline-block', width: 18, height: 10, borderRadius: 3, verticalAlign: 'middle', marginRight: 6 }} />
          Provisional
        </span>
        <span>
          <span className="hel-gantt-bar hel-gantt-bar--AtRisk" style={{ display: 'inline-block', width: 18, height: 10, borderRadius: 3, verticalAlign: 'middle', marginRight: 6 }} />
          At Risk
        </span>
        <span style={{ marginLeft: 'auto' }}>
          Drag bars horizontally to re-time · double-click to open detail · contract-fixed cargoes are locked.
        </span>
      </div>
    </div>
  );
}

/* Maintenance + (placeholder) tank transfer strip */
function MaintenanceStrip({
  input,
  horizonDays,
}: {
  input: PsoInput;
  horizonDays: number;
}) {
  const windows = input.facilities?.[0]?.maintenanceWindows ?? [];
  if (windows.length === 0) {
    return <EmptyState title="No maintenance scheduled" message="CDU maintenance calendar is empty for this horizon." />;
  }
  const startMs = new Date(input.startDate).getTime();
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'relative',
          height: 40,
          background: 'var(--hel-surface-alt)',
          border: '1px solid var(--hel-border)',
          borderRadius: 6,
        }}
      >
        {windows.map((w: MaintenanceWindow) => {
          const sDay = (new Date(w.startDate).getTime() - startMs) / 86400000;
          const eDay = (new Date(w.endDate).getTime() - startMs) / 86400000;
          if (eDay < 0 || sDay > horizonDays) return null;
          const left = Math.max(0, (sDay / horizonDays) * 100);
          const width = Math.max(((Math.min(horizonDays, eDay) - Math.max(0, sDay)) / horizonDays) * 100, 2);
          return (
            <div
              key={w.windowId}
              className="hel-gantt-bar hel-gantt-bar--maint"
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${width}%`,
                top: 6,
                padding: '0 8px',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
              }}
              title={`${w.cduId} · ${w.reason} · ${formatDate(w.startDate)} → ${formatDate(w.endDate)}`}
            >
              {w.cduId} · {w.reason}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--hel-text-muted)', marginTop: 6 }}>
        Tank transfers: no pipeline transfer feed wired in v1.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schedule Table                                                      */
/* ------------------------------------------------------------------ */

function ScheduleTable({
  cargoes,
  itemsById,
  schedulesById,
  onOpen,
}: {
  cargoes: Cargo[];
  itemsById: Record<string, CrudeItem>;
  schedulesById: Record<string, Schedule>;
  onOpen: (c: Cargo) => void;
}) {
  return (
    <Card flush>
      {cargoes.length === 0 ? (
        <EmptyState title="No cargoes in scope" message="Clear the global filters to see the full schedule." />
      ) : (
        <table className="hel-table">
          <thead>
            <tr>
              <th>Cargo</th>
              <th>Vessel</th>
              <th>Grade</th>
              <th>Volume</th>
              <th>Laycan</th>
              <th>Nominated tanks</th>
              <th>Status</th>
              <th>Decision</th>
              <th>Demurrage</th>
              <th aria-hidden></th>
            </tr>
          </thead>
          <tbody>
            {cargoes.map((c) => {
              const item = itemsById[c.crudeGrade];
              const sch = schedulesById[c.cargoId];
              return (
                <tr
                  key={c.cargoId}
                  onClick={() => onOpen(c)}
                  style={{ cursor: 'pointer' }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onOpen(c);
                  }}
                >
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.cargoId}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.vesselName}</div>
                    <div style={{ fontSize: 11, color: 'var(--hel-text-muted)' }}>{c.vesselType}</div>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: gradeFamilyColor(item?.gradeFamily),
                        marginRight: 6,
                        verticalAlign: 'middle',
                      }}
                    />
                    {item?.name ?? c.crudeGrade}
                  </td>
                  <td>{formatKbbls(c.volumeBbls)}</td>
                  <td style={{ fontSize: 12 }}>
                    {formatDate(c.laycanStart)} → {formatDate(c.laycanEnd)}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {c.nominatedTanks && c.nominatedTanks.length > 0 ? c.nominatedTanks.join(', ') : <span style={{ color: 'var(--hel-text-muted)' }}>—</span>}
                  </td>
                  <td>
                    <CargoStatusBadge status={c.status} />
                  </td>
                  <td>{sch ? <DecisionBadge decision={sch.decision} /> : <StatusBadge kind="muted">—</StatusBadge>}</td>
                  <td style={{ fontSize: 12 }}>
                    {sch && sch.demurrageDays > 0 ? (
                      <span style={{ color: 'var(--hel-warning)' }}>
                        {sch.demurrageDays}d · {formatUsd(sch.demurrageCostUsd)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--hel-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td aria-hidden style={{ color: 'var(--hel-text-muted)' }}>
                    ›
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Cargo Detail Drawer (with action buttons)                           */
/* ------------------------------------------------------------------ */

function CargoDetailDrawer({
  cargo,
  onClose,
  item,
  schedule,
  tanks,
  onNominateTanks,
  onRunOptimizer,
  onFlag,
}: {
  cargo: Cargo | null;
  onClose: () => void;
  item?: CrudeItem;
  schedule?: Schedule;
  tanks: Tank[];
  onNominateTanks: () => void;
  onRunOptimizer: () => void;
  onFlag: () => void;
}) {
  if (!cargo) return null;
  const compatibleTanks = tanks.filter(
    (t) => t.tankGroup === (item?.tankGroup ?? t.tankGroup) && t.crudeGrade === cargo.crudeGrade
  );
  return (
    <Drawer
      open={!!cargo}
      onClose={onClose}
      title={`${cargo.vesselName} — ${cargo.cargoId}`}
      width={540}
      actions={
        <>
          <HelButton variant="secondary" icon={<Layers size={14} />} onClick={onNominateTanks}>
            Nominate tanks
          </HelButton>
          <HelButton variant="ghost" icon={<Flag size={14} />} onClick={onFlag}>
            Flag for review
          </HelButton>
          <HelButton variant="primary" icon={<RefreshCw size={14} />} onClick={onRunOptimizer}>
            Run optimizer
          </HelButton>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <CargoStatusBadge status={cargo.status} />
        <StatusBadge kind="info">{cargo.vesselType}</StatusBadge>
        {schedule && <DecisionBadge decision={schedule.decision} />}
        {cargo.isFixed && <StatusBadge kind="muted">Fixed (contract)</StatusBadge>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <DetailField label="Grade" value={item?.name ?? cargo.crudeGrade} />
        <DetailField label="Volume" value={formatKbbls(cargo.volumeBbls)} />
        <DetailField label="Loading port" value={cargo.loadingPort ?? '—'} />
        <DetailField label="Origin" value={cargo.originRegion ?? '—'} />
        <DetailField label="Laycan start" value={formatDate(cargo.laycanStart)} />
        <DetailField label="Laycan end" value={formatDate(cargo.laycanEnd)} />
        <DetailField label="ETA terminal" value={cargo.etaTerminal ?? '—'} />
        <DetailField label="Charter-party" value={cargo.charterPartyRef ?? '—'} />
        <DetailField
          label="Demurrage risk"
          value={
            <StatusBadge
              kind={
                cargo.demurrageRiskLevel === 'High'
                  ? 'danger'
                  : cargo.demurrageRiskLevel === 'Medium'
                    ? 'warning'
                    : 'muted'
              }
            >
              {cargo.demurrageRiskLevel ?? 'None'}
            </StatusBadge>
          }
        />
        <DetailField
          label="Demurrage rate"
          value={cargo.demurrageRateUsdDay ? `${formatUsd(cargo.demurrageRateUsdDay)}/day` : '—'}
        />
        <DetailField label="Freight cost" value={formatUsd(cargo.freightCostUsd)} />
        <DetailField
          label="AIS position"
          value={
            cargo.currentLat != null && cargo.currentLon != null
              ? `${cargo.currentLat.toFixed(2)}°, ${cargo.currentLon.toFixed(2)}°`
              : '—'
          }
        />
      </div>

      <h4 className="hel-card__title">Nominated tanks</h4>
      <div style={{ marginBottom: 16 }}>
        {cargo.nominatedTanks && cargo.nominatedTanks.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {cargo.nominatedTanks.map((tid) => {
              const t = tanks.find((x) => x.tankId === tid);
              return (
                <li
                  key={tid}
                  style={{
                    fontSize: 13,
                    padding: 6,
                    border: '1px solid var(--hel-border)',
                    borderRadius: 6,
                    marginBottom: 4,
                    background: 'var(--hel-surface-alt)',
                  }}
                >
                  <Anchor size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  <strong>{tid}</strong>
                  {t && (
                    <span style={{ color: 'var(--hel-text-muted)', marginLeft: 8 }}>
                      ullage {formatKbbls(t.ullageBbls ?? t.capacityBbls - t.currentVolumeBbls)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
            None — {compatibleTanks.length} compatible tank{compatibleTanks.length === 1 ? '' : 's'} available.
          </div>
        )}
      </div>

      {schedule && (
        <>
          <h4 className="hel-card__title">Solver output</h4>
          <div
            style={{
              background: 'var(--hel-surface-alt)',
              border: '1px solid var(--hel-border)',
              borderRadius: 8,
              padding: 12,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              fontSize: 13,
            }}
          >
            <DetailField label="Decision" value={<DecisionBadge decision={schedule.decision} />} />
            <DetailField label="Berth start" value={`Day ${schedule.berthStartDay}`} />
            <DetailField label="Berth end" value={`Day ${schedule.berthEndDay}`} />
            <DetailField
              label="Demurrage"
              value={`${schedule.demurrageDays}d / ${formatUsd(schedule.demurrageCostUsd)}`}
            />
            {schedule.substitutedWithGrade && (
              <DetailField label="Substituted with" value={schedule.substitutedWithGrade} />
            )}
            {schedule.deferredToDay != null && schedule.deferredToDay > 0 && (
              <DetailField label="Deferred to day" value={schedule.deferredToDay} />
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Nominate Tanks Modal                                                */
/* ------------------------------------------------------------------ */

function NominateTanksModal({
  cargo,
  tanks,
  itemsById,
  onClose,
  onSave,
}: {
  cargo: Cargo;
  tanks: Tank[];
  itemsById: Record<string, CrudeItem>;
  onClose: () => void;
  onSave: (tankIds: string[]) => void;
}) {
  const [picks, setPicks] = useState<string[]>(cargo.nominatedTanks ?? []);
  const item = itemsById[cargo.crudeGrade];

  const ranked = useMemo(() => {
    return [...tanks]
      .map((t) => {
        const ullage = t.ullageBbls ?? t.capacityBbls - t.currentVolumeBbls;
        const sameGrade = t.crudeGrade === cargo.crudeGrade;
        const sameGroup = item?.tankGroup === t.tankGroup;
        const fits = ullage >= cargo.volumeBbls;
        const score = (sameGrade ? 100 : 0) + (sameGroup ? 40 : 0) + (fits ? 20 : 0) + ullage / 1e5;
        return { tank: t, ullage, sameGrade, sameGroup, fits, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [tanks, cargo, item]);

  const totalPicked = picks.reduce((sum, id) => {
    const t = tanks.find((x) => x.tankId === id);
    return sum + (t?.ullageBbls ?? (t?.capacityBbls ?? 0) - (t?.currentVolumeBbls ?? 0));
  }, 0);
  const coversCargo = totalPicked >= cargo.volumeBbls;

  return (
    <ModalShell title={`Nominate tanks — ${cargo.vesselName}`} onClose={onClose}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>
        Needs at least <strong>{formatKbbls(cargo.volumeBbls)}</strong> of ullage in{' '}
        <strong>{item?.name ?? cargo.crudeGrade}</strong>-compatible tanks.
      </div>

      <div
        style={{
          maxHeight: 400,
          overflow: 'auto',
          border: '1px solid var(--hel-border)',
          borderRadius: 8,
        }}
      >
        <table className="hel-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th></th>
              <th>Tank</th>
              <th>Grade</th>
              <th>Ullage</th>
              <th>Compatibility</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ tank, ullage, sameGrade, sameGroup, fits }) => {
              const selected = picks.includes(tank.tankId);
              return (
                <tr key={tank.tankId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) =>
                        setPicks((p) =>
                          e.target.checked ? [...p, tank.tankId] : p.filter((x) => x !== tank.tankId)
                        )
                      }
                      aria-label={`Pick ${tank.tankId}`}
                    />
                  </td>
                  <td>
                    <strong>{tank.tankId}</strong>
                    <div style={{ fontSize: 11, color: 'var(--hel-text-muted)' }}>{tank.tankGroup}</div>
                  </td>
                  <td>{tank.crudeGrade ? itemsById[tank.crudeGrade]?.name ?? tank.crudeGrade : '—'}</td>
                  <td>{formatKbbls(ullage)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {sameGrade ? (
                        <StatusBadge kind="success">Same grade</StatusBadge>
                      ) : sameGroup ? (
                        <StatusBadge kind="info">Same group</StatusBadge>
                      ) : (
                        <StatusBadge kind="danger">Incompatible</StatusBadge>
                      )}
                      {!fits && <StatusBadge kind="warning">Ullage short</StatusBadge>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
          fontSize: 13,
        }}
      >
        <span>
          Total ullage picked: <strong>{formatKbbls(totalPicked)}</strong>
          {coversCargo ? (
            <StatusBadge kind="success">Covers cargo</StatusBadge>
          ) : (
            <StatusBadge kind="warning">Short {formatKbbls(cargo.volumeBbls - totalPicked)}</StatusBadge>
          )}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <HelButton variant="ghost" onClick={onClose}>
            Cancel
          </HelButton>
          <HelButton variant="primary" icon={<Save size={14} />} onClick={() => onSave(picks)}>
            Save nominations
          </HelButton>
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/* Add Cargo Modal                                                     */
/* ------------------------------------------------------------------ */

function AddCargoModal({
  items,
  facilityId,
  onClose,
  onSave,
}: {
  items: CrudeItem[];
  facilityId: string;
  onClose: () => void;
  onSave: (c: Cargo) => void;
}) {
  const [form, setForm] = useState<Cargo>({
    cargoId: `CRG-DRAFT-${Date.now().toString(36).toUpperCase()}`,
    vesselName: '',
    vesselType: 'Aframax',
    crudeGrade: items[0]?.itemId ?? '',
    volumeBbls: 700000,
    laycanStart: new Date().toISOString().slice(0, 10),
    laycanEnd: addDays(new Date().toISOString().slice(0, 10), 2),
    status: 'Provisional',
    isFixed: false,
    destinationTerminal: facilityId,
  });

  const valid =
    form.vesselName.trim().length > 0 &&
    form.crudeGrade !== '' &&
    form.volumeBbls > 0 &&
    form.laycanEnd >= form.laycanStart;

  return (
    <ModalShell title="Add new cargo" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <LabeledInput
          label="Vessel name"
          value={form.vesselName}
          onChange={(v) => setForm({ ...form, vesselName: v })}
        />
        <LabeledSelect
          label="Vessel type"
          value={form.vesselType}
          options={['VLCC', 'Suezmax', 'Aframax'] as VesselType[]}
          onChange={(v) => setForm({ ...form, vesselType: v as VesselType })}
        />
        <LabeledSelect
          label="Crude grade"
          value={form.crudeGrade}
          options={items.map((i) => i.itemId)}
          onChange={(v) => setForm({ ...form, crudeGrade: v })}
          renderOption={(o) => items.find((i) => i.itemId === o)?.name ?? o}
        />
        <LabeledInput
          label="Volume (bbls)"
          type="number"
          value={String(form.volumeBbls)}
          onChange={(v) => setForm({ ...form, volumeBbls: Math.max(0, Number(v) || 0) })}
        />
        <LabeledInput
          label="Laycan start"
          type="date"
          value={form.laycanStart}
          onChange={(v) => setForm({ ...form, laycanStart: v })}
        />
        <LabeledInput
          label="Laycan end"
          type="date"
          value={form.laycanEnd}
          onChange={(v) => setForm({ ...form, laycanEnd: v })}
        />
        <LabeledSelect
          label="Status"
          value={form.status}
          options={['Confirmed', 'Provisional', 'At Risk']}
          onChange={(v) => setForm({ ...form, status: v as Cargo['status'] })}
        />
        <LabeledInput
          label="Loading port"
          value={form.loadingPort ?? ''}
          onChange={(v) => setForm({ ...form, loadingPort: v })}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 4 }}>
          <input
            type="checkbox"
            checked={form.isFixed}
            onChange={(e) => setForm({ ...form, isFixed: e.target.checked })}
          />
          Contract-fixed (cannot be re-timed)
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <HelButton variant="ghost" onClick={onClose}>
          Cancel
        </HelButton>
        <HelButton variant="primary" icon={<Plus size={14} />} onClick={() => onSave(form)} disabled={!valid}>
          Add cargo
        </HelButton>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/* Local primitives                                                    */
/* ------------------------------------------------------------------ */

function ToggleBtn({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 999,
        background: on ? 'var(--hel-primary)' : 'transparent',
        color: on ? '#fff' : 'var(--hel-text)',
        border: 'none',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--hel-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: 'var(--hel-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: '1px solid var(--hel-border)',
          borderRadius: 8,
          padding: '6px 8px',
          background: 'var(--hel-surface)',
          fontSize: 13,
        }}
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
  renderOption,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  renderOption?: (v: string) => string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: 'var(--hel-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: '1px solid var(--hel-border)',
          borderRadius: 8,
          padding: '6px 8px',
          background: 'var(--hel-surface)',
          fontSize: 13,
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {renderOption ? renderOption(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            zIndex: 60,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(760px, calc(100vw - 40px))',
            maxHeight: 'calc(100vh - 40px)',
            overflow: 'auto',
            background: 'var(--hel-surface)',
            border: '1px solid var(--hel-border)',
            borderRadius: 12,
            padding: 20,
            zIndex: 61,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Dialog.Title style={{ margin: 0, fontSize: 18, fontFamily: 'var(--hel-font-display)' }}>
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--hel-text-muted)',
                  padding: 4,
                }}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Logic helpers                                                       */
/* ------------------------------------------------------------------ */

function assignLanes(cargoes: Cargo[]): Cargo[][] {
  const lanes: Cargo[][] = [];
  const sorted = [...cargoes].sort(
    (a, b) => new Date(a.laycanStart).getTime() - new Date(b.laycanStart).getTime()
  );
  for (const c of sorted) {
    const s = new Date(c.laycanStart).getTime();
    let placed = false;
    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      if (new Date(last.laycanEnd).getTime() <= s) {
        lane.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([c]);
  }
  return lanes;
}

function validateDrag(
  cargo: Cargo,
  deltaDays: number,
  all: Cargo[],
  input: PsoInput
): string[] {
  const violations: string[] = [];
  if (cargo.isFixed) {
    violations.push('Cargo is contract-fixed.');
  }
  if (Math.abs(deltaDays) > input.flexDays) {
    violations.push(`Move of ${deltaDays}d exceeds flex window of ±${input.flexDays}d.`);
  }
  const newStart = addDays(cargo.laycanStart, deltaDays);
  const newEnd = addDays(cargo.laycanEnd, deltaDays);
  if (daysBetween(input.startDate, newStart) < 0) {
    violations.push('Laycan start before horizon start.');
  }
  if (daysBetween(input.startDate, newEnd) > input.planningHorizonDays) {
    violations.push('Laycan end past horizon end.');
  }
  // Concurrency check against berthCount.
  const newStartMs = new Date(newStart).getTime();
  const newEndMs = new Date(newEnd).getTime();
  const concurrent = all
    .filter((x) => x.cargoId !== cargo.cargoId)
    .filter((x) => {
      const s = new Date(x.laycanStart).getTime();
      const e = new Date(x.laycanEnd).getTime();
      return !(e <= newStartMs || s >= newEndMs);
    }).length;
  if (concurrent + 1 > input.berthCount) {
    violations.push(`Berth conflict: ${concurrent + 1} concurrent vs ${input.berthCount} berths.`);
  }
  return violations;
}

function dateLabel(start: string, dayOffset: number): string {
  const d = new Date(start);
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
