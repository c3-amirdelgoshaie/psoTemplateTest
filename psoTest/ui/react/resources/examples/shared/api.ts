/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { User, UserGroup, Document, Program } from '@/Interfaces';
import { c3Action } from '@/c3Action';

export const fetchUsers = async (): Promise<User[]> => {
  const response = await c3Action('User', 'fetch', { limit: -1 });
  return response.objs;
};

export const fetchUserGroups = async (): Promise<UserGroup[]> => {
  const response = await c3Action('UserGroup', 'fetch', { limit: -1 });
  return response.objs;
};

export interface DocumentFilters {
  program?: string;
  owner?: string;
  checklistApplied?: string;
  uploadedBy?: string;
  documentName?: string;
}

export const fetchDocuments = async (
  limit: number = 10,
  offset: number = 0,
  filters?: DocumentFilters
): Promise<{ objs: Document[]; count: number }> => {
  const filterSpec: Record<string, unknown> = { limit, offset };

  if (filters) {
    const filterConditions: string[] = [];

    if (filters.program) {
      filterConditions.push(`program == '${filters.program}'`);
    }
    if (filters.owner) {
      filterConditions.push(`owner == '${filters.owner}'`);
    }
    if (filters.checklistApplied) {
      filterConditions.push(`checklistApplied == '${filters.checklistApplied}'`);
    }
    if (filters.uploadedBy) {
      filterConditions.push(`uploadedBy == '${filters.uploadedBy}'`);
    }
    if (filters.documentName) {
      filterConditions.push(`contains(documentName, '${filters.documentName}')`);
    }

    if (filterConditions.length > 0) {
      filterSpec.filter = filterConditions.join(' && ');
    }
  }

  const response = await c3Action('Document', 'fetch', filterSpec);
  return {
    objs: response.objs,
    count: response.count,
  };
};

export interface ProgramFilters {
  program?: string;
}

export const fetchPrograms = async (
  limit: number = 10,
  offset: number = 0,
  filters?: ProgramFilters
): Promise<{ objs: Program[]; count: number }> => {
  const filterSpec: Record<string, unknown> = { limit, offset };

  if (filters?.program) {
    filterSpec.filter = `contains(program, '${filters.program}')`;
  }

  const response = await c3Action('Program', 'fetch', filterSpec);
  return {
    objs: response.objs,
    count: response.count,
  };
};
