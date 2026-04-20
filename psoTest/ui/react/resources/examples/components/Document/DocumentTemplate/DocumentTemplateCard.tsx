/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { Clock, FileText } from 'lucide-react';
import { DocumentTemplate } from '@/Interfaces';
import { cn } from '@/lib/utils';

interface DocumentTemplateCardProps {
  template: DocumentTemplate;
  className?: string;
  isSelected?: boolean;
}

export default function DocumentTemplateCard({
  template,
  className = '',
  isSelected = false,
}: DocumentTemplateCardProps) {
  return (
    <div
      className={cn(
        'c3-card p-4 hover:shadow-md transition-shadow cursor-pointer border h-full flex flex-col',
        isSelected ? 'border-accent ring-2 ring-accent shadow-md' : 'border-gray-20 hover:border-accent',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent-weak rounded-lg flex items-center justify-center">
            <FileText className="h-5 w-5 text-accent" strokeWidth={2} aria-hidden />
          </div>
          <div>
            <h3 className="font-medium mb-1">{template.name}</h3>
            {template.estimatedTime && (
              <div className="flex items-center gap-1 text-sm text-secondary">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                {template.estimatedTime}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-secondary mb-4 leading-relaxed flex-1">{template.description}</p>
    </div>
  );
}
