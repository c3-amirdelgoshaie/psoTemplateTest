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
 * Shared DataTable built with TanStack Table + shadcn Table (replaces Kendo Grid).
 */
import React from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  type SortingState,
  getPaginationRowModel,
  type PaginationState,
  type OnChangeFn,
} from '@tanstack/react-table';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type { ColumnDef, SortingState, PaginationState };

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  pagination?: {
    pageIndex: number;
    pageSize: number;
    totalCount: number;
    onPageChange?: (pageIndex: number, pageSize: number) => void;
    pageSizes?: number[];
    mode?: 'client' | 'server';
  };
  clientPagination?: boolean;
  className?: string;
  emptyMessage?: React.ReactNode;
}

export function DataTable<TData>({
  data,
  columns,
  sorting = [],
  onSortingChange,
  pagination,
  clientPagination = false,
  className,
  emptyMessage = 'No results.',
}: DataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>(sorting);
  const sortState = onSortingChange ? sorting : internalSorting;
  const handleSortingChange: OnChangeFn<SortingState> = React.useCallback(
    (updaterOrValue) => {
      const next = typeof updaterOrValue === 'function' ? updaterOrValue(sortState) : updaterOrValue;
      if (onSortingChange) {
        onSortingChange(next);
      } else {
        setInternalSorting(next);
      }
    },
    [onSortingChange, sortState]
  );

  const paginationState: PaginationState = pagination
    ? { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize }
    : { pageIndex: 0, pageSize: data.length };

  const isServerPagination = pagination?.mode === 'server';

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sortState,
      ...(pagination && !isServerPagination ? { pagination: paginationState } : {}),
    },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(!isServerPagination &&
    (clientPagination || (pagination && pagination.totalCount <= (pagination?.pageSize ?? 9999)))
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    manualSorting: !!onSortingChange,
    manualPagination: isServerPagination,
    pageCount: isServerPagination && pagination ? Math.ceil(pagination.totalCount / pagination.pageSize) : undefined,
  });

  const rows = table.getRowModel().rows;
  const totalCount = pagination?.totalCount ?? data.length;
  const pageSize = pagination?.pageSize ?? data.length;
  const pageIndex = pagination?.pageIndex ?? 0;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pageCount - 1;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative w-full overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:underline"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ChevronUpIcon className="size-4" />,
                          desc: <ChevronDownIcon className="size-4" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {pagination && totalCount > 0 && (
        <div className="flex flex-col gap-3 px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              {`${pageIndex * pageSize + 1}-${Math.min((pageIndex + 1) * pageSize, totalCount)} of ${totalCount}`}
            </span>
            {pagination.pageSizes && pagination.pageSizes.length > 0 && pagination.onPageChange ? (
              <label className="flex items-center gap-2">
                <span className="text-secondary">Rows per page</span>
                <select
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring"
                  value={pageSize}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    pagination.onPageChange?.(0, next);
                  }}
                >
                  {pagination.pageSizes.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange?.(pageIndex - 1, pageSize)}
              disabled={!canPrev}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="text-sm">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange?.(pageIndex + 1, pageSize)}
              disabled={!canNext}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
