/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

interface Node {
  id: string;
  label: string;
  type: 'primary' | 'family' | 'employee';
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
}

interface NetworkGraphProps {
  width?: number;
  height?: number;
  className?: string;
}

// Static network data - moved outside component to prevent recreation on every render
const nodes: Node[] = [
  { id: 'john', label: 'John Doe', type: 'primary', x: 200, y: 250 },
  { id: 'jane', label: 'Jane Doe (Spouse)', type: 'family', x: 400, y: 250 },
  { id: 'jimmy', label: 'Jimmy Doe (Dependent)', type: 'family', x: 300, y: 400 },
  { id: 'jelly', label: 'Jelly Doe (Dependent)', type: 'family', x: 500, y: 400 },
  { id: 'emp1', label: 'Employee 1', type: 'employee', x: 100, y: 150 },
  { id: 'emp2', label: 'Employee 2', type: 'employee', x: 300, y: 150 },
  { id: 'emp3', label: 'Employee 3', type: 'employee', x: 100, y: 350 },
  { id: 'emp4', label: 'Employee 4', type: 'employee', x: 500, y: 150 },
];

const edges: Edge[] = [
  { from: 'john', to: 'jane' },
  { from: 'john', to: 'jimmy' },
  { from: 'john', to: 'jelly' },
  { from: 'john', to: 'emp1' },
  { from: 'john', to: 'emp2' },
  { from: 'john', to: 'emp3' },
  { from: 'jane', to: 'emp2' },
  { from: 'jane', to: 'emp4' },
  { from: 'jane', to: 'jimmy' },
  { from: 'jane', to: 'jelly' },
];

/** Matches canvas node fills — inline styles on legend swatches so colors always render */
const LEGEND_ITEMS: { label: string; color: string }[] = [
  { label: 'Primary member', color: '#0078d4' },
  { label: 'Family', color: '#7b2cbf' },
  { label: 'Interactions with Employees', color: '#6b8e23' },
];

export default function NetworkGraph({ width = 800, height = 600, className = '' }: NetworkGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: width, height: height });
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    const readDark = () => setIsDarkMode(document.documentElement.classList.contains('dark'));
    readDark();
    document.addEventListener('c3-theme-changed', readDark);
    const observer = new MutationObserver(readDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      document.removeEventListener('c3-theme-changed', readDark);
      observer.disconnect();
    };
  }, []);

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'primary':
        return '#0078d4'; // Blue
      case 'family':
        return '#7b2cbf'; // Purple
      case 'employee':
        return '#6b8e23'; // Olive green
      default:
        return '#666';
    }
  };

  const drawNetwork = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Apply zoom and pan
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(pan.x, pan.y);

    // Draw edges
    ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 2;
    edges.forEach((edge) => {
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (fromNode && toNode) {
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.stroke();
      }
    });

    // Draw nodes
    nodes.forEach((node) => {
      const color = getNodeColor(node.type);

      // Draw circle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 25, 0, 2 * Math.PI);
      ctx.fill();

      // Draw border
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw person icon (simple circle with lines)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(node.x, node.y, 15, 0, 2 * Math.PI);
      ctx.fill();

      // Draw person symbol
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y - 3, 5, 0, Math.PI);
      ctx.moveTo(node.x - 5, node.y + 2);
      ctx.lineTo(node.x + 5, node.y + 2);
      ctx.stroke();
    });

    // Draw labels
    ctx.fillStyle = isDarkMode ? '#e8e8ea' : '#1a1a1a';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    nodes.forEach((node) => {
      ctx.fillText(node.label, node.x, node.y + 45);
    });

    ctx.restore();
  }, [canvasSize, zoom, pan, isDarkMode]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const newWidth = Math.max(400, containerWidth - 32); // Account for padding
        const newHeight = Math.max(300, (newWidth * 3) / 4); // Maintain aspect ratio
        setCanvasSize({ width: newWidth, height: newHeight });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    drawNetwork();
  }, [drawNetwork]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.5, Math.min(3, prev * delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3, prev * 1.2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.5, prev * 0.8));
  };

  const handleFullscreen = () => {
    if (canvasRef.current?.requestFullscreen) {
      canvasRef.current.requestFullscreen();
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Legend — theme-aware panel; swatches use explicit hex (matches canvas) */}
      <div
        className="absolute top-4 left-4 z-10 rounded-md border border-weak bg-card p-3 text-card-foreground shadow-sm"
        role="list"
        aria-label="Network legend"
      >
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="mb-2 flex items-center gap-2 last:mb-0" role="listitem">
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-weak shadow-sm"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span className="text-sm">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Network Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="w-full cursor-grab rounded-md border border-weak bg-primary"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      />

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleZoomIn}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-weak bg-card text-card-foreground hover:bg-muted"
          title="Zoom In"
        >
          <span className="text-lg font-medium">+</span>
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-weak bg-card text-card-foreground hover:bg-muted"
          title="Zoom Out"
        >
          <span className="text-lg font-medium">-</span>
        </button>
        <button
          type="button"
          onClick={handleFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-weak bg-card text-card-foreground hover:bg-muted"
          title="Fullscreen"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
