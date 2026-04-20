/*
 * Helleniq Crude Schedule Optimizer — Side Navigation.
 *
 * Spec reference (lines 35-39):
 *   - Icons + labels for all five screens [six in v1: Dashboard, Schedule,
 *     Feedstock Plan, Optimizer, Registry, Recommendations]
 *   - Collapse button (icon-only mode)
 *   - Bottom section: data feed health indicator
 *
 * The sidebar uses the spec-mandated #0B2545 deep navy background with a
 * #1D9E75 teal active indicator on the left edge.
 */

import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Ship,
  Factory,
  Sparkles,
  ListChecks,
  ClipboardList,
  Droplets,
} from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { getInputData } from '../../shared/crudeApi';

interface NavItem {
  id: string;
  path: string;
  icon: typeof Ship;
  label: string;
}

const NAV: NavItem[] = [
  { id: 'dashboard',    path: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'schedule',     path: '/schedule',      icon: Ship,            label: 'Cargo Schedule' },
  { id: 'feedstock',    path: '/feedstock',     icon: Factory,         label: 'Feedstock Plan' },
  { id: 'optimizer',    path: '/optimizer',     icon: Sparkles,        label: 'Diet Optimizer' },
  { id: 'registry',     path: '/registry',      icon: ClipboardList,   label: 'Cargo & SKU Registry' },
  { id: 'recs',         path: '/recommendations', icon: ListChecks,    label: 'Recommendations' },
];

function feedHealth(freshness?: Record<string, string>): {
  tone: 'live' | 'partial' | 'degraded';
  label: string;
  stale: string[];
} {
  if (!freshness || Object.keys(freshness).length === 0) {
    return { tone: 'degraded', label: 'No feeds', stale: [] };
  }
  const now = Date.now();
  const stale = Object.entries(freshness)
    .filter(([, ts]) => {
      const age = now - new Date(ts).getTime();
      return age > 24 * 3600 * 1000 * 2; // >2d = stale
    })
    .map(([k]) => k);

  if (stale.length === 0) return { tone: 'live', label: 'All feeds live', stale };
  if (stale.length < Object.keys(freshness).length) {
    return { tone: 'partial', label: `${stale.length} feed(s) stale`, stale };
  }
  return { tone: 'degraded', label: 'Feeds degraded', stale };
}

export default function SideNav() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const { data: input } = useQuery({
    queryKey: ['psoInput'],
    queryFn: getInputData,
    staleTime: 60_000,
  });

  const health = useMemo(() => feedHealth(input?.dataFreshness), [input]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <nav className={`hel-sidebar ${collapsed ? 'hel-sidebar--collapsed' : ''}`} aria-label="Primary">
      <div className="hel-sidebar__brand">
        <Droplets size={22} color="#1D9E75" />
        {!collapsed && (
          <div>
            <div className="hel-sidebar__brand-text">Helleniq Energy</div>
            <div className="hel-sidebar__brand-sub">Crude Schedule Optimizer</div>
          </div>
        )}
      </div>

      <ul className="hel-sidebar__nav">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <li key={item.id}>
              <a
                href={`#${item.path}`}
                className={`hel-sidebar__link ${active ? 'hel-sidebar__link--active' : ''}`}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                title={item.label}
              >
                <Icon size={18} />
                {!collapsed && <span>{item.label}</span>}
              </a>
            </li>
          );
        })}
      </ul>

      <div className="hel-sidebar__footer">
        <button
          type="button"
          className="hel-btn hel-btn--ghost hel-btn--sm"
          style={{ color: 'rgba(255,255,255,0.7)', width: '100%', justifyContent: 'center' }}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          {!collapsed && 'Collapse'}
        </button>

        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            color: 'rgba(255,255,255,0.75)',
            fontSize: 11,
          }}
          title={health.stale.length ? `Stale feeds: ${health.stale.join(', ')}` : 'All feeds live'}
        >
          <span className={`hel-feed-dot hel-feed-dot--${health.tone}`} />
          {!collapsed && health.label}
        </div>
      </div>
    </nav>
  );
}
