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
import type { DocumentFilters } from './api';

type Opt = { text: string; value: string } | null;

/** Build API filter object from applied dashboard selections (omit when empty). */
export function documentFiltersFromApplied(params: {
  appliedProgram: Opt;
  appliedOwner: Opt;
  appliedChecklist: Opt;
  appliedUploadedBy: Opt;
  appliedSearchText: string;
}): DocumentFilters | undefined {
  const f: DocumentFilters = {};
  if (params.appliedProgram) f.program = params.appliedProgram.text;
  if (params.appliedOwner) f.owner = params.appliedOwner.text;
  if (params.appliedChecklist) f.checklistApplied = params.appliedChecklist.text;
  if (params.appliedUploadedBy) f.uploadedBy = params.appliedUploadedBy.text;
  if (params.appliedSearchText) f.documentName = params.appliedSearchText;
  return Object.keys(f).length > 0 ? f : undefined;
}
