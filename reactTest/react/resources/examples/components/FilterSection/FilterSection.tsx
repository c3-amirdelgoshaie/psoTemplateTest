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
import React from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface FilterSectionProps {
  id: string;
  title: string;
  expanded: string[];
  onExpandedChange: React.Dispatch<React.SetStateAction<string[]>>;
  children: React.ReactNode;
  className?: string;
}

export function FilterSection({ id, title, expanded, onExpandedChange, children, className }: FilterSectionProps) {
  const open = expanded.includes(id);

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        onExpandedChange((prev) =>
          next ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)
        );
      }}
      className={cn('border-b border-weak last:border-b-0', className)}
    >
      <CollapsibleTrigger
        type="button"
        className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-primary hover:bg-muted/30"
      >
        <span>{title}</span>
        {open ? <ChevronUpIcon className="size-4 shrink-0" /> : <ChevronDownIcon className="size-4 shrink-0" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 pb-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
