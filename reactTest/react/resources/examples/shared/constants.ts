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
 * Shared copy and nav config for example pages (single source for LLM-friendly templates).
 */

export const EXAMPLE_APP_TITLE = 'C3 Doc Management';

/** TopNav `tabs` for checklist routes */
export const CHECKLIST_TOP_NAV_TABS: { title: string; path: string }[] = [
  { title: 'System Checklists', path: '/checklist' },
  { title: 'Custom Checklists', path: '/checklist/custom' },
];
