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
 * Small color dot for metric-card legends (C3 bg-* utility on className).
 */
import React from 'react';

import { cn } from '@/lib/utils';

export function ExampleLegendSwatch({ className }: { className: string }) {
  return (
    <span
      className={cn('inline-block h-3 w-3 shrink-0 rounded-full border border-weak shadow-sm', className)}
      aria-hidden
    />
  );
}
