/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { LineChart, Settings, Users } from 'lucide-react';
import TopNav from '@/components/TopNav/TopNav';
import { EXAMPLE_APP_TITLE } from '@/shared/constants';
import Map, { type Turbine } from '../../components/Map/Map';

// Sample wind turbine locations around the Bay Area
const WIND_TURBINES: Turbine[] = [
  {
    id: 1,
    name: 'Turbine Alpha',
    latitude: 37.5309,
    longitude: -122.1941,
    status: 'operational',
    powerOutput: 2.3,
    efficiency: 94.2,
    type: 'turbine',
  },
  {
    id: 2,
    name: 'Turbine Beta',
    latitude: 37.5109,
    longitude: -122.2141,
    status: 'maintenance',
    powerOutput: 0,
    efficiency: 0,
    type: 'turbine',
  },
  {
    id: 3,
    name: 'Turbine Gamma',
    latitude: 37.5409,
    longitude: -122.1841,
    status: 'operational',
    powerOutput: 2.1,
    efficiency: 91.8,
    type: 'turbine',
  },
  {
    id: 4,
    name: 'Turbine Delta',
    latitude: 37.5009,
    longitude: -122.2241,
    status: 'operational',
    powerOutput: 2.4,
    efficiency: 96.1,
    type: 'turbine',
  },
];

export default function AnalyticsPage() {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
        return 'text-green-600';
      case 'maintenance':
        return 'text-yellow-600';
      case 'offline':
        return 'text-red-600';
      default:
        return 'text-secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return '🟢';
      case 'maintenance':
        return '🟡';
      case 'offline':
        return '🔴';
      default:
        return '⚪';
    }
  };

  return (
    <>
      <TopNav title={EXAMPLE_APP_TITLE} />
      <div className="p-4">
        <div className="c3-page-content-enter">
          {/* Header */}
          <div className="c3-card mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Wind Turbine Analytics</h2>
                <p className="text-sm text-secondary">
                  Real-time monitoring and analysis of wind turbine performance across the Bay Area
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-secondary">Total Power Output</div>
                  <div className="text-2xl font-medium text-accent">6.8 MW</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-secondary">Active Turbines</div>
                  <div className="text-2xl font-medium text-success">3/4</div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content: map full width, then metrics row */}
          <div className="space-y-4">
            <div className="c3-card">
              <div className="mb-4">
                <h2 className="text-lg font-medium">Turbine Locations</h2>
                <p className="text-sm text-secondary">Interactive map showing wind turbine locations and status</p>
              </div>
              <Map turbines={WIND_TURBINES} height="500px" showHeadquarters={true} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Performance Metrics */}
              <div className="c3-card">
                <div>
                  <h2 className="mb-4 text-lg font-medium">Performance Metrics</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LineChart className="h-4 w-4 text-accent shrink-0" strokeWidth={2} aria-hidden />
                      <span className="text-sm">Average Efficiency</span>
                    </div>
                    <span className="font-medium text-secondary">94.0%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-success shrink-0" strokeWidth={2} aria-hidden />
                      <span className="text-sm">Operational Rate</span>
                    </div>
                    <span className="font-medium text-secondary">75%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-warning shrink-0" strokeWidth={2} aria-hidden />
                      <span className="text-sm">Maintenance Due</span>
                    </div>
                    <span className="font-medium text-secondary">1</span>
                  </div>
                </div>
              </div>

              {/* Turbine Status List */}
              <div className="c3-card">
                <div>
                  <h2 className="mb-4 text-lg font-medium">Turbine Status</h2>
                </div>
                <div className="space-y-4">
                  {WIND_TURBINES.map((turbine) => (
                    <div key={turbine.id} className="flex items-center justify-between rounded-lg hover:bg-gray-10">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getStatusIcon(turbine.status)}</span>
                        <div>
                          <div className="text-sm font-medium">{turbine.name}</div>
                          <div className="text-xs text-secondary">{turbine.powerOutput} MW</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-medium ${getStatusColor(turbine.status)}`}>
                          {turbine.status.charAt(0).toUpperCase() + turbine.status.slice(1)}
                        </div>
                        <div className="text-xs text-secondary">{turbine.efficiency}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="c3-card">
                <div>
                  <h2 className="mb-4 text-lg font-medium">Quick Actions</h2>
                </div>
                <div className="space-y-4">
                  <button className="w-full bg-accent px-3 py-2 text-sm text-inverse transition-colors hover:bg-accent-hover">
                    Generate Report
                  </button>
                  <button className="w-full border border-accent px-3 py-2 text-sm text-accent transition-colors hover:bg-accent hover:text-inverse">
                    Schedule Maintenance
                  </button>
                  <button className="w-full border border-primary px-3 py-2 text-sm text-primary transition-colors hover:bg-gray-10">
                    Export Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
