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
import React, { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NetworkGraph from '../../components/NetworkGraph/NetworkGraph';
import DocumentGenerationModal from './DocumentGenerationModal/DocumentGenerationModal';
import TopNav from '@/components/TopNav/TopNav';
import { EXAMPLE_APP_TITLE } from '@/shared/constants';
import { ExampleLegendSwatch } from '../../components/ExampleLegendSwatch';
import { FilterSection } from '../../components/FilterSection/FilterSection';

export default function OverviewPage() {
  useTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState('details');
  const [expanded, setExpanded] = useState<string[]>(['basicDetails', 'plan', 'memberDependents', 'deductible']);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleGenerateDocument = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <TopNav title={EXAMPLE_APP_TITLE} />
      <div className="c3-page-content-enter">
        <div>
          <div className="flex flex-col items-start gap-4 bg-primary px-4 pt-4 lg:flex-row">
            <div className="w-full flex-shrink-0 pb-4 lg:max-w-sm">
              <h1 className="text-lg font-medium text-primary">Checklist Name</h1>
              <p className="mb-4 text-sm text-secondary">
                Checklist fo validating business-related receipts and expenses
              </p>
              <div>
                <div className="text-base font-medium text-secondary">CREATED BY</div>
                <div className="mb-4 text-base">System</div>
                <div className="text-base font-medium text-secondary">CREATED AT</div>
                <div className="mb-4 text-base">12/05/2025 10:00AM</div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleOpenModal}
                  className="w-full bg-accent px-4 py-1 text-base text-inverse transition-colors hover:bg-accent-hover focus:outline-none sm:w-auto"
                >
                  Open Modal
                </button>
                <button
                  type="button"
                  className="w-full border border-accent px-4 py-1 text-base text-accent transition-colors hover:bg-accent hover:text-inverse sm:w-auto"
                >
                  Action 2
                </button>
              </div>
            </div>
            <div className="grid w-full flex-1 grid-cols-1 divide-y divide-weak sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <div className="flex flex-col p-4">
                <span className="text-sm font-medium text-secondary">
                  METRIC NAME{' '}
                  <span className="cursor-pointer text-xs" title="More info">
                    ⓘ
                  </span>
                </span>
                <div className="flex items-center">
                  <span className="text-2xl">100,000</span>
                  <span className="ml-2 text-lg text-success">✓</span>
                </div>
                <div className="mb-2 flex items-center text-sm text-success">
                  <span className="mr-1">▲</span> 5 (.5%)
                </div>
                <div className="relative mb-2 h-20 overflow-hidden bg-success-weak sm:h-24 lg:h-28" />
                <div className="mt-2 text-xs text-secondary">Last 30 days</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1">
                    <ExampleLegendSwatch className="bg-success-strong" />
                    Item 1
                  </span>
                </div>
              </div>
              <div className="flex w-full flex-col p-4">
                <span className="text-sm font-medium text-secondary">
                  METRIC NAME{' '}
                  <span className="cursor-pointer text-xs" title="More info">
                    ⓘ
                  </span>
                </span>
                <div className="flex items-center">
                  <span className="text-2xl">100,000</span>
                  <span className="ml-2 text-lg text-danger">⚠</span>
                </div>
                <div className="mb-2 flex items-center text-sm text-danger">
                  <span className="mr-1">▼</span> 5 (.5%)
                </div>
                <div className="relative mb-2 h-20 overflow-hidden bg-danger-weak sm:h-24 md:h-[7.5rem]" />
                <div className="mt-2 text-xs text-secondary">Last 30 days</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1">
                    <ExampleLegendSwatch className="bg-danger-strong" />
                    Item 1
                  </span>
                </div>
              </div>
              <div className="flex w-full flex-col p-4">
                <span className="text-sm font-medium text-secondary">
                  METRIC NAME{' '}
                  <span className="cursor-pointer text-xs" title="More info">
                    ⓘ
                  </span>
                </span>
                <div className="flex items-center">
                  <span className="text-2xl">100,000</span>
                  <span className="ml-2 text-lg text-danger">⚠</span>
                </div>
                <div className="mb-2 flex items-center text-sm text-danger">
                  <span className="mr-1">▼</span> 5 (.5%)
                </div>
                <div className="relative mb-2 h-20 overflow-hidden bg-danger-weak sm:h-24 md:h-[7.5rem]" />
                <div className="mt-2 text-xs text-secondary">Last 30 days</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1">
                    <ExampleLegendSwatch className="bg-danger-strong" />
                    Item 1
                  </span>
                  <span className="flex items-center gap-1">
                    <ExampleLegendSwatch className="bg-tertiary" />
                    Plan
                  </span>
                </div>
              </div>
              <div className="flex flex-col p-4">
                <span className="text-sm font-medium text-secondary">
                  METRIC NAME{' '}
                  <span className="cursor-pointer text-xs" title="More info">
                    ⓘ
                  </span>
                </span>
                <div className="flex items-center">
                  <span className="text-2xl">100,000</span>
                  <span className="ml-2 text-lg text-success">✓</span>
                </div>
                <div className="mb-2 flex items-center text-sm text-success">
                  <span className="mr-1">▲</span> 5 (.5%)
                </div>
                <div className="relative mb-2 h-20 overflow-hidden bg-accent-weak sm:h-24 md:h-[7.5rem]" />
                <div className="mt-2 text-xs text-secondary">Last 30 days</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1">
                    <ExampleLegendSwatch className="bg-accent-strong" />
                    Item 1
                  </span>
                  <span className="flex items-center gap-1">
                    <ExampleLegendSwatch className="bg-tertiary" />
                    Plan
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="bg-primary">
            <TabsList variant="line" className="w-full max-w-4xl">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="network">Network</TabsTrigger>
              <TabsTrigger value="history">Call History</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-2 px-4">
              <div className="c3-card">
                <FilterSection
                  id="basicDetails"
                  title="Basic Details"
                  expanded={expanded}
                  onExpandedChange={setExpanded}
                >
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <div className="block text-sm font-medium tracking-wide text-secondary uppercase">
                          MEMBER STATUS
                        </div>
                        <div className="mt-1 text-base text-primary">Active</div>
                      </div>
                      <div>
                        <div className="block text-sm font-medium tracking-wide text-secondary uppercase">
                          EFFECTIVE DATE
                        </div>
                        <div className="mt-1 text-base text-primary">May 16, 2022</div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="block text-sm font-medium tracking-wide text-secondary uppercase">
                          REGISTERED FOR PORTAL
                        </div>
                        <div className="mt-1 text-base text-primary">Yes</div>
                      </div>
                      <div>
                        <div className="block text-sm font-medium tracking-wide text-secondary uppercase">
                          TERMINATION DATE
                        </div>
                        <div className="mt-1 text-base text-primary">May 16, 2028</div>
                      </div>
                    </div>
                  </div>
                </FilterSection>

                <FilterSection id="plan" title="Plan" expanded={expanded} onExpandedChange={setExpanded}>
                  <div className="space-y-4">
                    <div>
                      <div className="block text-sm font-medium tracking-wide text-secondary uppercase">PLAN NAME</div>
                      <div className="mt-1 text-base text-primary">Silver Care Prescription Plan</div>
                    </div>
                    <div>
                      <div className="block text-sm font-medium tracking-wide text-secondary uppercase">
                        PLAN DETAILS
                      </div>
                      <div className="mt-1 text-base text-primary">Label</div>
                    </div>
                  </div>
                </FilterSection>

                <FilterSection
                  id="memberDependents"
                  title="Member Dependents"
                  expanded={expanded}
                  onExpandedChange={setExpanded}
                >
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <div className="block text-sm font-medium tracking-wide text-secondary uppercase">
                          DEPENDENT NAME
                        </div>
                        <div className="mt-1 text-base text-primary">Tom Doe</div>
                      </div>
                      <div>
                        <div className="block text-sm font-medium tracking-wide text-secondary uppercase">
                          DEPENDENT STATUS
                        </div>
                        <div className="mt-1 text-base text-primary">Active</div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="block text-sm font-medium tracking-wide text-secondary uppercase">
                          DEPENDENT NAME
                        </div>
                        <div className="mt-1 text-base text-primary">Jane Doe</div>
                      </div>
                      <div>
                        <div className="block text-sm font-medium tracking-wide text-secondary uppercase">
                          DEPENDENT STATUS
                        </div>
                        <div className="mt-1 text-base text-primary">Active</div>
                      </div>
                    </div>
                  </div>
                </FilterSection>

                <FilterSection id="deductible" title="Deductible" expanded={expanded} onExpandedChange={setExpanded}>
                  <div className="space-y-4">
                    <div>
                      <div className="block text-sm font-medium tracking-wide text-secondary uppercase">LOGIC</div>
                      <div className="mt-1 text-base text-primary"></div>
                    </div>
                  </div>
                </FilterSection>
              </div>
            </TabsContent>

            <TabsContent value="network" className="px-4 pt-2">
              <NetworkGraph />
            </TabsContent>

            <TabsContent value="history" className="mt-2 space-y-4 px-4">
              <div className="c3-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <h3 className="text-lg font-medium text-secondary">Call Sentiment</h3>
                  <span className="text-sm text-gray-500">ⓘ</span>
                </div>
                <p className="mb-4 text-gray-600">Overwhelmingly Positive</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Negative</span>
                    <span className="text-gray-600">Neutral</span>
                    <span className="text-gray-600">Positive</span>
                  </div>
                  <div className="flex h-6 overflow-hidden rounded-full bg-gray-200">
                    <div className="w-24 bg-danger-weak"></div>
                    <div className="w-48 bg-warning-weak"></div>
                    <div className="w-48 bg-success-weak"></div>
                  </div>
                </div>
              </div>

              <div className="c3-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <h3 className="text-lg font-medium text-secondary">Timeline</h3>
                  <span className="text-sm text-gray-500">ⓘ</span>
                </div>
                <div className="space-y-4">
                  {[
                    ['Form complete', '82% percent of the form was filled in based on the transcript', 'just now'],
                    ['Transcription finished', '13m to transcribe the call', '1hr ago'],
                    ['Call received', '3m 13s call ended', 'Nov 12, 2024'],
                  ].map(([title, body, time]) => (
                    <div key={String(title)} className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-gray-300">
                        <span className="text-xs text-gray-600">⋯</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-secondary">{title}</p>
                        <p className="text-sm text-gray-600">{body}</p>
                        <p className="mt-1 text-xs text-blue-600">{time}</p>
                      </div>
                      <span className="text-sm text-gray-500">⋮</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="c3-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <h3 className="text-lg font-medium text-secondary">Recent Calls</h3>
                  <span className="text-sm text-gray-500">ⓘ</span>
                </div>
                <div className="space-y-6">
                  <div>
                    <a className="mb-2 font-medium" href="#a">
                      July 12, 2024
                    </a>
                    <p className="text-sm leading-relaxed text-gray-600">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                      labore et dolore magna aliqua.
                    </p>
                  </div>
                  <div>
                    <a className="mb-2 font-medium" href="#a">
                      June 24, 2024
                    </a>
                    <p className="text-sm leading-relaxed text-gray-600">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                      labore et dolore magna aliqua.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      className="cursor-pointer border-none bg-transparent p-0 text-sm font-medium text-blue-600 hover:underline"
                    >
                      View All
                    </button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <DocumentGenerationModal isOpen={isModalOpen} onClose={handleCloseModal} onGenerate={handleGenerateDocument} />
    </>
  );
}
