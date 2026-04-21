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
import React, { useMemo, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useLocation, useNavigate } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import TopNav from '@/components/TopNav/TopNav';
import { CHECKLIST_TOP_NAV_TABS, EXAMPLE_APP_TITLE } from '@/shared/constants';

interface CheckRow {
  id: number;
  title: string;
  description: string;
  critical: boolean;
}

const CHECKS_DATA: CheckRow[] = [
  {
    id: 1,
    title: 'Date of Receipt Included',
    description: 'Ensure that the receipt included within the document has a legible date of receipt included.',
    critical: true,
  },
  {
    id: 2,
    title: 'Billing Address included',
    description: 'Ensure that the receipt included within the document has the billing address.',
    critical: true,
  },
  {
    id: 3,
    title: 'Company Seal Included',
    description: 'Ensure that the receipt included has our company seal.',
    critical: true,
  },
  {
    id: 4,
    title: 'Total Amount adds up',
    description: 'Ensure that for the receipt provided the total amount sums up to the line items included',
    critical: true,
  },
  {
    id: 5,
    title: 'Duplicate Receipt',
    description: 'Ensure that we are not double counting duplicate receipts attached to the same document.',
    critical: false,
  },
  {
    id: 6,
    title: 'Line Items Provided',
    description: 'Ensure that the receipt provided has line items',
    critical: false,
  },
  {
    id: 7,
    title: 'Payment Processed',
    description: 'Verify that the payment is completed successfully',
    critical: false,
  },
  {
    id: 8,
    title: 'Invoice Number',
    description: 'Make sure the invoice number is unique and traceable',
    critical: false,
  },
  {
    id: 9,
    title: 'Customer Details',
    description: 'Ensure customer information is accurate and up-to-date',
    critical: false,
  },
  {
    id: 10,
    title: 'Delivery Status',
    description: 'Confirm the status of the delivery and tracking information',
    critical: false,
  },
];

export default function ChecklistDetailPage() {
  useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const checklistData = location.state?.checklistData || {
    id: 1,
    title: 'Receipt Checklist',
    count: '15',
    description: 'Checklist for validating business-related receipts and expenses.',
  };

  const [searchText, setSearchText] = useState<string>('');

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return CHECKS_DATA;
    return CHECKS_DATA.filter((r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [searchText]);

  const columns: ColumnDef<CheckRow>[] = useMemo(
    () => [
      { accessorKey: 'title', header: 'Title' },
      { accessorKey: 'description', header: 'Description' },
      {
        accessorKey: 'critical',
        header: 'Critical',
        cell: ({ row }) => {
          const critical = row.original.critical;
          const cls = critical ? 'bg-danger-weak text-danger' : 'bg-gray-weak text-gray';
          return <span className={`rounded px-2 py-1 text-md ${cls}`}>{critical ? 'Yes' : 'No'}</span>;
        },
      },
    ],
    []
  );

  return (
    <>
      <TopNav title={EXAMPLE_APP_TITLE} tabs={CHECKLIST_TOP_NAV_TABS} />
      <div className="c3-page-content-enter">
        <div>
          <div className="border-b border-weak bg-primary px-4 py-2">
            <nav className="text-sm">
              <button
                type="button"
                onClick={() => navigate('/checklist')}
                className="text-primary hover:underline focus:outline-none"
              >
                System Checklists
              </button>
              <span className="mx-2 text-secondary">&gt;</span>
              <span className="font-medium text-primary">Checklist Detail</span>
            </nav>
          </div>

          <div className="flex flex-col gap-4 p-4 lg:flex-row">
            <div className="min-w-0 flex-1">
              <div className="c3-card mb-4">
                <div className="flex gap-8">
                  <div className="flex-1">
                    <h1 className="mb-2 text-lg font-medium text-primary">{checklistData.description}</h1>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <div className="text-sm font-medium text-secondary">NO. OF CHECKS</div>
                        <div className="text-lg font-medium text-primary">{checklistData.count}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-secondary">CREATED BY</div>
                        <div className="text-lg font-medium text-primary">System</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-secondary">CREATED AT</div>
                        <div className="text-lg font-medium text-primary">12/05/2025 10:00AM</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="c3-card mb-4">
                <div className="grid grid-cols-1 divide-y divide-weak sm:grid-cols-2 sm:divide-x sm:divide-y-0 md:grid-cols-3 xl:grid-cols-5">
                  <div className="flex flex-col p-4">
                    <div className="mb-2 text-sm font-medium text-secondary">NO. OF DOCUMENTS APPLIED TO</div>
                    <div className="mb-2 text-2xl font-medium text-primary">290</div>
                    <div className="relative mb-2 h-16 overflow-hidden bg-accent-weak sm:h-20 md:h-24" />
                    <div className="text-xs text-secondary">Last 30 days</div>
                  </div>
                  <div className="flex flex-col p-4">
                    <div className="mb-2 text-sm font-medium text-secondary">NO. OF CHECKS PASSED</div>
                    <div className="mb-2 text-2xl font-medium text-primary">2,890</div>
                    <div className="relative mb-2 h-16 overflow-hidden bg-success-weak sm:h-20 md:h-24" />
                    <div className="text-xs text-secondary">Last 30 days</div>
                  </div>
                  <div className="flex flex-col p-4">
                    <div className="mb-2 text-sm font-medium text-secondary">NO. OF CHECKS FAILED</div>
                    <div className="mb-2 text-2xl font-medium text-primary">1,460</div>
                    <div className="relative mb-2 h-16 overflow-hidden bg-danger-weak sm:h-20 md:h-24" />
                    <div className="text-xs text-secondary">Last 30 days</div>
                  </div>
                  <div className="flex flex-col p-4">
                    <div className="mb-2 text-sm font-medium text-secondary">NO. OF CHECKS ACCEPTED</div>
                    <div className="mb-2 text-2xl font-medium text-primary">3,670</div>
                    <div className="relative mb-2 h-16 overflow-hidden bg-accent-weak sm:h-20 md:h-24" />
                    <div className="text-xs text-secondary">Last 30 days</div>
                  </div>
                  <div className="flex flex-col p-4">
                    <div className="mb-2 text-sm font-medium text-secondary">NO. OF CHECKS OVERRIDDEN</div>
                    <div className="mb-2 text-2xl font-medium text-primary">680</div>
                    <div className="relative mb-2 h-16 overflow-hidden bg-tertiary-weak sm:h-20 md:h-24" />
                    <div className="text-xs text-secondary">Last 30 days</div>
                  </div>
                </div>
              </div>

              <div className="c3-card">
                <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <h2 className="text-lg font-medium">Checks</h2>
                  <div className="w-full sm:w-80 md:w-96">
                    <Input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Q Search"
                      className="w-full"
                    />
                  </div>
                </div>
                <DataTable data={filteredRows} columns={columns} />
              </div>
            </div>

            <div className="w-full flex-shrink-0 space-y-4 lg:w-80">
              <div className="c3-card">
                <h3 className="mb-4 text-lg font-medium">Basic Metrics</h3>
                <div className="space-y-4">
                  {[
                    ['NO. OF PASSED', '200'],
                    ['NO. OF FAILED', '90'],
                    ['NO. OF ACCEPTED', '260'],
                    ['NO. OF OVERRIDDEN', '30'],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <div className="text-sm font-medium text-secondary">{k}</div>
                      <div className="text-lg font-medium text-primary">{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="c3-card">
                <h3 className="mb-4 text-lg font-medium">Top Override Reasoning</h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-secondary">REASONING 1</div>
                    <div className="text-base text-primary">Value Exists</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-secondary">REASONING 2</div>
                    <div className="text-base text-primary">Value does not exists</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-secondary">REASONING 3</div>
                    <div className="text-base text-primary">--</div>
                  </div>
                </div>
              </div>

              <div className="c3-card">
                <h3 className="mb-4 text-lg font-medium">Recent Documents Applied To</h3>
                <div className="space-y-4">
                  {['Document 54457', 'Document 56248'].map((name) => (
                    <div key={name} className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-secondary">DOCUMENT NAME</div>
                        <div className="text-base text-primary">{name}</div>
                      </div>
                      <a
                        href="https://www.google.com"
                        target="_blank"
                        className="rounded p-1 transition-colors hover:bg-accent-weak"
                        title="Open in new window"
                        aria-label={`Open ${name} in new window`}
                        rel="noopener noreferrer"
                      >
                        <svg className="h-4 w-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
