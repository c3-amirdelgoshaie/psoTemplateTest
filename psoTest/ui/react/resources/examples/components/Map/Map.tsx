/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Type definitions for integration
export interface Turbine {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  status: 'operational' | 'maintenance' | 'offline';
  powerOutput: number;
  efficiency: number;
  type: 'turbine';
}

export interface Headquarters {
  name: string;
  address: string;
  type: 'headquarters';
  latitude: number;
  longitude: number;
}

// C3 AI Headquarters coordinates (1400 Seaport Blvd, Redwood City, CA)
const C3_HEADQUARTERS = {
  latitude: 37.5209,
  longitude: -122.2041,
  address: '1400 Seaport Blvd, Redwood City, CA 94063',
  name: 'C3 AI Headquarters',
  type: 'headquarters',
};

interface MapProps {
  turbines: Turbine[];
  height?: string;
  showHeadquarters?: boolean;
  className?: string;
  center?: [number, number];
  zoom?: number;
}

const TILE_PROVIDERS = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors & CartoDB',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors & CartoDB',
  },
};

export default function Map({
  turbines,
  height = '400px',
  showHeadquarters = true,
  className = '',
  center = [C3_HEADQUARTERS.latitude, C3_HEADQUARTERS.longitude],
  zoom = 13,
}: MapProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };
    checkTheme();
    const handleThemeChange = () => checkTheme();
    document.addEventListener('c3-theme-changed', handleThemeChange);
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      document.removeEventListener('c3-theme-changed', handleThemeChange);
      observer.disconnect();
    };
  }, []);

  const tile = TILE_PROVIDERS[theme];

  return (
    <MapContainer center={center} zoom={zoom} style={{ height, width: '100%' }} className={className}>
      <TileLayer url={tile.url} attribution={tile.attribution} />
      {showHeadquarters && (
        <Marker position={[C3_HEADQUARTERS.latitude, C3_HEADQUARTERS.longitude]}>
          <Popup>
            <b>{C3_HEADQUARTERS.name}</b>
            <br />
            {C3_HEADQUARTERS.address}
          </Popup>
        </Marker>
      )}
      {turbines.map((turbine) => (
        <Marker key={turbine.id} position={[turbine.latitude, turbine.longitude]}>
          <Popup>
            <b>{turbine.name}</b>
            <br />
            Status: {turbine.status}
            <br />
            Power Output: {turbine.powerOutput} MW
            <br />
            Efficiency: {turbine.efficiency}%
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
