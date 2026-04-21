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
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { Program, ProgramDocument } from '@/Interfaces';
import { fetchPrograms, ProgramFilters } from '@/shared/api';
import { EXAMPLE_APP_TITLE } from '@/shared/constants';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import DocumentsFilterSidebar from '../../components/DocumentsFilterSidebar';
import TopNav from '@/components/TopNav/TopNav';
import ProgramsPageSkeleton from '@/components/LoadingStates/ProgramsPageSkeleton';

const chartData = [
  { category: 'Jan', value: 100, forecast: 105 },
  { category: 'Feb', value: 120, forecast: 125 },
  { category: 'Mar', value: 95, forecast: 100 },
  { category: 'Apr', value: 110, forecast: 115 },
  { category: 'May', value: 130, forecast: 135 },
  { category: 'Jun', value: 125, forecast: 130 },
];

const pieData = [
  { category: 'Passed', value: 45, color: '#28a745' },
  { category: 'Failed', value: 25, color: '#dc3545' },
  { category: 'Pending', value: 30, color: '#ffc107' },
];

const barData = [
  { category: 'Q1', value: 150 },
  { category: 'Q2', value: 180 },
  { category: 'Q3', value: 165 },
  { category: 'Q4', value: 200 },
];

function MiniLineChart() {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <Line type="monotone" dataKey="value" stroke="#007bff" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MiniPieChart() {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <PieChart>
        <Pie data={pieData} dataKey="value" nameKey="category" cx="50%" cy="50%" innerRadius={18} outerRadius={32}>
          {pieData.map((entry) => (
            <Cell key={entry.category} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function MiniBarChart() {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={barData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <Bar dataKey="value" fill="#dc3545" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MiniAreaChart() {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <Area type="monotone" dataKey="value" stroke="#6c757d" fill="#6c757d" fillOpacity={0.25} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DocumentsSubTable({ rows }: { rows: ProgramDocument[] }) {
  const [docPageSize, setDocPageSize] = useState(25);
  const [docSkip, setDocSkip] = useState(0);

  useEffect(() => {
    setDocSkip(0);
  }, [rows.length, docPageSize]);

  const docTotal = rows.length;
  const docPageIndex = Math.floor(docSkip / docPageSize);
  const docPageCount = Math.max(1, Math.ceil(docTotal / docPageSize) || 1);
  const safeSkip = Math.min(docSkip, Math.max(0, (docPageCount - 1) * docPageSize));
  const pageRows = rows.slice(safeSkip, safeSkip + docPageSize);

  const goDocPrev = useCallback(() => {
    setDocSkip((s) => Math.max(0, s - docPageSize));
  }, [docPageSize]);

  const goDocNext = useCallback(() => {
    setDocSkip((s) => Math.min(Math.max(0, docTotal - docPageSize), s + docPageSize));
  }, [docPageSize, docTotal]);

  return (
    <div className="c3-card border border-weak">
      <div className="max-h-[min(28rem,70vh)] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document Name</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-secondary">
                  No documents
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((d, i) => (
                <TableRow key={`${d.documentName}-${safeSkip + i}`}>
                  <TableCell>{d.documentName}</TableCell>
                  <TableCell>{d.owner}</TableCell>
                  <TableCell>{d.status}</TableCell>
                  <TableCell>{d.uploadedAt}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {docTotal > 0 ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-weak pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{`${safeSkip + 1}-${Math.min(safeSkip + docPageSize, docTotal)} of ${docTotal}`}</span>
            <label className="flex items-center gap-2">
              <span className="text-secondary">Rows per page</span>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring"
                value={docPageSize}
                onChange={(e) => setDocPageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={docPageIndex <= 0} onClick={goDocPrev}>
              Prev
            </Button>
            <span className="text-sm">
              Page {docPageIndex + 1} of {docPageCount}
            </span>
            <Button variant="outline" size="sm" disabled={docPageIndex >= docPageCount - 1} onClick={goDocNext}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ProgramsPage() {
  const [programsData, setProgramsData] = useState<Program[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [pageSize] = useState<number>(10);
  const [skip, setSkip] = useState<number>(0);

  const [selectedProject, setSelectedProject] = useState<{ text: string; value: string } | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<{ text: string; value: string } | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<{ text: string; value: string } | null>(null);
  const [selectedChecklist, setSelectedChecklist] = useState<{ text: string; value: string } | null>(null);
  const [selectedUploadedBy, setSelectedUploadedBy] = useState<{ text: string; value: string } | null>(null);
  const [uploadDate, setUploadDate] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');

  const [appliedSearchText, setAppliedSearchText] = useState<string>('');
  const [expanded, setExpanded] = useState<string[]>(['documentDetails', 'uploadDetails']);
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);

  useTheme();

  useEffect(() => {
    const loadPrograms = async () => {
      try {
        setLoading(true);
        setError(null);

        const filters: ProgramFilters = {};
        if (appliedSearchText) filters.program = appliedSearchText;

        const result = await fetchPrograms(pageSize, skip, Object.keys(filters).length > 0 ? filters : undefined);
        setProgramsData(result.objs);
        setTotalCount(result.count);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load programs';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadPrograms();
  }, [pageSize, skip, appliedSearchText]);

  const handleApplyFilter = () => {
    setAppliedSearchText(searchText);
    setSkip(0);
  };

  const handleClearAll = () => {
    setSelectedProject(null);
    setSelectedProgram(null);
    setSelectedOwner(null);
    setSelectedChecklist(null);
    setSelectedUploadedBy(null);
    setUploadDate('');
    setSearchText('');
    setAppliedSearchText('');
    setSkip(0);
  };

  const pageIndex = Math.floor(skip / pageSize);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  const lineChart = useMemo(() => <MiniLineChart />, []);
  const pieChart = useMemo(() => <MiniPieChart />, []);
  const barChart = useMemo(() => <MiniBarChart />, []);
  const areaChart = useMemo(() => <MiniAreaChart />, []);

  return (
    <>
      <TopNav title={EXAMPLE_APP_TITLE} />
      <div className="p-4">
        {loading ? (
          <div key="programs-skeleton" className="c3-page-skeleton-enter">
            <ProgramsPageSkeleton />
          </div>
        ) : (
          <div key="programs-content" className="c3-page-content-enter">
            <div className="c3-card">
              <div className="grid w-full grid-cols-1 divide-y divide-weak md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
                <div className="flex flex-col p-4">
                  <span className="text-sm font-medium text-secondary">TOTAL # OF DOCUMENTS UPLOADED</span>
                  <span className="text-2xl">211</span>
                  <span className="mb-2 text-sm text-accent">5 (.5%)</span>
                  <div className="relative z-10 h-20 overflow-visible sm:h-24 md:h-[7.5rem]">{lineChart}</div>
                  <div className="mt-2 text-xs text-secondary">Last 30 days</div>
                </div>

                <div className="flex flex-col p-4">
                  <span className="text-sm font-medium text-secondary">DOCUMENTS PASSED</span>
                  <span className="text-2xl">95</span>
                  <span className="mb-2 text-sm text-success">5 (.5%)</span>
                  <div className="relative z-10 h-20 overflow-visible sm:h-24 md:h-[7.5rem]">{pieChart}</div>
                  <div className="mt-2 text-xs text-secondary">Last 30 days</div>
                </div>

                <div className="flex flex-col p-4">
                  <span className="text-sm font-medium text-secondary">DOCUMENTS FAILED</span>
                  <span className="text-2xl">25</span>
                  <span className="mb-2 text-sm text-danger">5 (.5%)</span>
                  <div className="relative z-10 h-20 overflow-visible sm:h-24 md:h-[7.5rem]">{barChart}</div>
                  <div className="mt-2 text-xs text-secondary">Last 30 days</div>
                </div>

                <div className="flex flex-col p-4">
                  <span className="text-sm font-medium text-secondary">NO. OF AI RECOMMENDED-FAIL</span>
                  <span className="text-2xl">12</span>
                  <span className="mb-2 text-sm text-tertiary">5 (.5%)</span>
                  <div className="relative z-10 h-20 overflow-visible sm:h-24 md:h-[7.5rem]">{areaChart}</div>
                  <div className="mt-2 text-xs text-secondary">Last 30 days</div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-1 flex-col gap-4 lg:flex-row">
              <DocumentsFilterSidebar
                cardClassName="ml-4 sm:ml-0"
                expanded={expanded}
                onExpandedChange={setExpanded}
                selectedProject={selectedProject}
                setSelectedProject={setSelectedProject}
                selectedProgram={selectedProgram}
                setSelectedProgram={setSelectedProgram}
                selectedOwner={selectedOwner}
                setSelectedOwner={setSelectedOwner}
                selectedChecklist={selectedChecklist}
                setSelectedChecklist={setSelectedChecklist}
                selectedUploadedBy={selectedUploadedBy}
                setSelectedUploadedBy={setSelectedUploadedBy}
                uploadDate={uploadDate}
                setUploadDate={setUploadDate}
                onApply={handleApplyFilter}
                onClear={handleClearAll}
              />

              <div className="c3-card min-w-0 w-full">
                <div>
                  <h2 className="text-lg font-medium">Program Documents Overview</h2>
                  <p className="text-sm text-secondary">Expand rows to view individual documents</p>

                  <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <Input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Search programs..."
                      className="w-full sm:w-80 md:w-96"
                    />
                    <button
                      type="button"
                      className="flex w-full items-center justify-center space-x-2 bg-accent px-6 py-2 text-base text-inverse transition-colors hover:bg-accent-hover focus:outline-none sm:w-auto"
                    >
                      <span>Add Program</span>
                    </button>
                  </div>
                </div>

                <div className="min-w-0 w-full overflow-x-auto pt-4">
                  {error ? (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-danger">{error}</p>
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>Program</TableHead>
                            <TableHead>Total Documents</TableHead>
                            <TableHead>Passed</TableHead>
                            <TableHead>Failed</TableHead>
                            <TableHead>Pending</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {programsData.map((row) => {
                            const id = row.id ?? row.program;
                            const open = expandedProgramId === id;
                            return (
                              <React.Fragment key={id}>
                                <TableRow>
                                  <TableCell>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-expanded={open}
                                      aria-label={open ? 'Collapse row' : 'Expand row'}
                                      onClick={() => setExpandedProgramId(open ? null : id)}
                                    >
                                      <ChevronRightIcon
                                        className={cn('size-4 transition-transform', open && 'rotate-90')}
                                      />
                                    </Button>
                                  </TableCell>
                                  <TableCell>{row.program}</TableCell>
                                  <TableCell>{row.totalDocuments}</TableCell>
                                  <TableCell>{row.passed}</TableCell>
                                  <TableCell>{row.failed}</TableCell>
                                  <TableCell>{row.pending}</TableCell>
                                </TableRow>
                                {open ? (
                                  <TableRow>
                                    <TableCell colSpan={6} className="bg-muted/20">
                                      <h4 className="mb-3 text-lg font-medium">Documents in {row.program}</h4>
                                      <DocumentsSubTable rows={row.documents ?? []} />
                                    </TableCell>
                                  </TableRow>
                                ) : null}
                              </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                      {pageCount > 1 ? (
                        <div className="mt-2 flex items-center justify-between gap-2 px-2 py-2">
                          <span className="text-sm text-muted-foreground">
                            {totalCount > 0
                              ? `${pageIndex * pageSize + 1}-${Math.min((pageIndex + 1) * pageSize, totalCount)} of ${totalCount}`
                              : '0 of 0'}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pageIndex <= 0}
                              onClick={() => setSkip((pageIndex - 1) * pageSize)}
                            >
                              Prev
                            </Button>
                            <span className="text-sm">
                              Page {pageIndex + 1} of {pageCount}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pageIndex >= pageCount - 1}
                              onClick={() => setSkip((pageIndex + 1) * pageSize)}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
