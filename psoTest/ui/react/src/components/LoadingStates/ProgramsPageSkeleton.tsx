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
 * Programs example: programs table (6 columns, narrow expand column).
 */
import React from 'react';

import DataPageSkeleton from './DataPageSkeleton';

export default function ProgramsPageSkeleton() {
  return (
    <DataPageSkeleton
      srLabel="Loading programs"
      tableCols={6}
      narrowFirstColumn
      filterCardClassName="ml-4 w-full flex-shrink-0 sm:ml-0 lg:w-80 xl:w-96"
    />
  );
}
