/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Shared metrics + filter + table row skeleton for Dashboard / Programs-style example pages.
 */
import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const METRIC_COLS = 4;
const FILTER_FIELD_ROWS = 4;
const UPLOAD_FIELD_ROWS = 2;
const DEFAULT_TABLE_ROWS = 10;

export interface DataPageSkeletonProps {
  /** Screen-reader message while loading */
  srLabel: string;
  tableCols: number;
  tableRows?: number;
  className?: string;

  /** Extra classes on the filter-panel card (e.g. Programs uses margin + width) */
  filterCardClassName?: string;

  /** First column is a narrow control (e.g. expand chevron) */
  narrowFirstColumn?: boolean;
}

function MetricTileSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-3 w-full max-w-[14rem]" />
      <Skeleton className="h-8 w-14" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-20 w-full rounded-sm" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

function FilterPanelSkeleton() {
  return (
    <div className="relative z-0 w-full flex-shrink-0 space-y-5 lg:w-80 xl:w-96">
      <div>
        <Skeleton className="mb-2 h-6 w-40" />
        <Skeleton className="h-4 w-full max-w-xs" />
      </div>
      <div className="space-y-4 border-b border-weak pb-4">
        <Skeleton className="h-5 w-36" />
        {Array.from({ length: FILTER_FIELD_ROWS }).map((_, i) => (
          <div key={`doc-${i}`} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: UPLOAD_FIELD_ROWS }).map((_, i) => (
          <div key={`up-${i}`} className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col justify-between gap-2 sm:flex-row">
        <Skeleton className="h-10 w-full sm:w-28" />
        <Skeleton className="h-10 w-full sm:w-28" />
      </div>
    </div>
  );
}

function cellSkeletonClass(ci: number, total: number, narrowFirst: boolean): string {
  if (narrowFirst && ci === 0) {
    return 'h-4 w-8';
  }
  if (ci === 0) {
    return 'h-4 w-[min(100%,14rem)]';
  }
  if (ci === 1) {
    return 'h-4 w-28';
  }
  if (ci === total - 1) {
    return 'h-4 w-24';
  }

  return 'h-4 w-20';
}

function DataTableBlock({
  tableCols,
  tableRows,
  narrowFirstColumn,
}: {
  tableCols: number;
  tableRows: number;
  narrowFirstColumn: boolean;
}) {
  return (
    <div className="min-w-0 w-full overflow-x-auto pt-4">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: tableCols }).map((_, i) => (
              <TableHead key={i} className="whitespace-nowrap">
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: tableRows }).map((_, ri) => (
            <TableRow key={ri}>
              {Array.from({ length: tableCols }).map((_, ci) => (
                <TableCell key={ci}>
                  <Skeleton className={cn('max-w-full', cellSkeletonClass(ci, tableCols, narrowFirstColumn))} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex flex-col flex-wrap items-center justify-between gap-4 sm:flex-row">
        <Skeleton className="h-4 w-52" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
    </div>
  );
}

export default function DataPageSkeleton({
  srLabel,
  tableCols,
  tableRows = DEFAULT_TABLE_ROWS,
  className,
  filterCardClassName,
  narrowFirstColumn = false,
}: DataPageSkeletonProps) {
  return (
    <div className={cn('space-y-0', className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{srLabel}</span>

      <div className="c3-card">
        <div className="grid w-full grid-cols-1 divide-y divide-weak md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
          {Array.from({ length: METRIC_COLS }).map((_, i) => (
            <MetricTileSkeleton key={i} />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-4 lg:flex-row">
        <div className={cn('c3-card', filterCardClassName)}>
          <FilterPanelSkeleton />
        </div>

        <div className="c3-card min-w-0 w-full flex-1">
          <div className="mb-4">
            <Skeleton className="mb-2 h-6 w-48" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <Skeleton className="h-10 w-full sm:w-80 md:w-96" />
            <Skeleton className="h-10 w-full sm:w-36" />
          </div>
          <DataTableBlock tableCols={tableCols} tableRows={tableRows} narrowFirstColumn={narrowFirstColumn} />
        </div>
      </div>
    </div>
  );
}
