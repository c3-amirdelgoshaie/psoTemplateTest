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
 * Reusable filter column for Dashboard / Programs examples (Document Details + Upload Details).
 */
import React from 'react';

import { Input } from '@/components/ui/input';
import { projects, programs, owners, checklists, uploadedBy } from '@/data/sampleData';
import { cn } from '@/lib/utils';
import { FilterSection } from './FilterSection/FilterSection';
import { OptionSelect } from './OptionSelect/OptionSelect';

type Opt = { text: string; value: string } | null;

export interface DocumentsFilterSidebarProps {
  cardClassName?: string;
  expanded: string[];
  onExpandedChange: (next: string[]) => void;
  selectedProject: Opt;
  setSelectedProject: (v: Opt) => void;
  selectedProgram: Opt;
  setSelectedProgram: (v: Opt) => void;
  selectedOwner: Opt;
  setSelectedOwner: (v: Opt) => void;
  selectedChecklist: Opt;
  setSelectedChecklist: (v: Opt) => void;
  selectedUploadedBy: Opt;
  setSelectedUploadedBy: (v: Opt) => void;
  uploadDate: string;
  setUploadDate: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
}

export default function DocumentsFilterSidebar({
  cardClassName,
  expanded,
  onExpandedChange,
  selectedProject,
  setSelectedProject,
  selectedProgram,
  setSelectedProgram,
  selectedOwner,
  setSelectedOwner,
  selectedChecklist,
  setSelectedChecklist,
  selectedUploadedBy,
  setSelectedUploadedBy,
  uploadDate,
  setUploadDate,
  onApply,
  onClear,
}: DocumentsFilterSidebarProps) {
  return (
    <div className={cn('c3-card relative z-0 w-full flex-shrink-0 lg:w-80 xl:w-96', cardClassName)}>
      <div>
        <h3 className="text-lg font-medium">Filter panel</h3>
        <p className="text-sm text-secondary">Filter documents by various criteria</p>
      </div>

      <FilterSection
        id="documentDetails"
        title="Document Details"
        expanded={expanded}
        onExpandedChange={onExpandedChange}
      >
        <div>
          <label htmlFor="project-dropdown" className="mb-1 block text-sm font-medium">
            Project
          </label>
          <OptionSelect
            id="project-dropdown"
            options={projects}
            value={selectedProject}
            onChange={setSelectedProject}
          />
        </div>
        <div>
          <label htmlFor="program-dropdown" className="mb-1 block text-sm font-medium">
            Program
          </label>
          <OptionSelect
            id="program-dropdown"
            options={programs}
            value={selectedProgram}
            onChange={setSelectedProgram}
          />
        </div>
        <div>
          <label htmlFor="owner-dropdown" className="mb-1 block text-sm font-medium">
            Owner Name
          </label>
          <OptionSelect id="owner-dropdown" options={owners} value={selectedOwner} onChange={setSelectedOwner} />
        </div>
        <div>
          <label htmlFor="checklist-dropdown" className="mb-1 block text-sm font-medium">
            Checklist Applied
          </label>
          <OptionSelect
            id="checklist-dropdown"
            options={checklists}
            value={selectedChecklist}
            onChange={setSelectedChecklist}
          />
        </div>
      </FilterSection>

      <FilterSection id="uploadDetails" title="Upload Details" expanded={expanded} onExpandedChange={onExpandedChange}>
        <div>
          <label htmlFor="uploadedby-dropdown" className="mb-1 block text-sm font-medium">
            Uploaded By
          </label>
          <OptionSelect
            id="uploadedby-dropdown"
            options={uploadedBy}
            value={selectedUploadedBy}
            onChange={setSelectedUploadedBy}
          />
        </div>
        <div>
          <label htmlFor="uploaddate-picker" className="mb-1 block text-sm font-medium">
            Upload Date
          </label>
          <Input
            id="uploaddate-picker"
            type="date"
            value={uploadDate}
            onChange={(e) => setUploadDate(e.target.value)}
            className="w-full"
          />
        </div>
      </FilterSection>

      <div className="mt-6 flex flex-col justify-between gap-2 sm:flex-row">
        <button
          type="button"
          className="w-full bg-accent px-6 py-2 text-base text-inverse transition-colors hover:bg-accent-hover focus:outline-none sm:w-auto"
          onClick={onApply}
        >
          Filter
        </button>
        <button
          type="button"
          className="w-full border border-accent px-6 py-2 text-base text-accent transition-colors hover:bg-accent hover:text-inverse sm:w-auto"
          onClick={onClear}
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
