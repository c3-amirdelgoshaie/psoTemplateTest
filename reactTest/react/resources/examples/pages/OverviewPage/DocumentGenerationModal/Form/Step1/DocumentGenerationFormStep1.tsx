/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useCallback } from 'react';

import { DocumentGenerationFormData } from '../../DocumentGenerationModal';
import { DocumentTemplate } from '@/Interfaces';
import DocumentTemplateCard from '../../../../../components/Document/DocumentTemplate/DocumentTemplateCard';

interface DocumentGenerationFormStep1Props {
  formData: DocumentGenerationFormData;
  onFormDataChange: (formData: DocumentGenerationFormData, isValid?: boolean) => void;
}

export default function DocumentGenerationFormStep1({ formData, onFormDataChange }: DocumentGenerationFormStep1Props) {
  const AVAILABLE_TEMPLATES: DocumentTemplate[] = [
    {
      id: 'rfp_proposal',
      name: 'RFP Proposal',
      description: 'Generate comprehensive Response Proposal for a Request for Proposal document',
      estimatedTime: '15-20 minutes',
    },
    {
      id: 'technical-spec',
      name: 'Technical Specification',
      description: 'Create detailed technical specifications for software projects',
      estimatedTime: '25-30 minutes',
    },
    {
      id: 'project-proposal',
      name: 'Project Proposal',
      description: 'Draft project proposals with timelines and resource requirements',
      estimatedTime: '20-25 minutes',
    },
    {
      id: 'user-manual',
      name: 'User Manual',
      description: 'Create comprehensive user manuals and documentation',
      estimatedTime: '30-35 minutes',
    },
  ];

  const handleTemplateSelect = useCallback(
    (template: DocumentTemplate) => {
      const newFormData = {
        ...formData,
        template: template,
      };

      const isValid = template.id !== '';

      onFormDataChange(newFormData, isValid);
    },
    [formData, onFormDataChange]
  );

  const selectedTemplate = AVAILABLE_TEMPLATES.find((t) => t.id === formData.template?.id);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl">Select Template</h2>
        <p className="text-sm text-secondary">Select template you want to apply for the new document</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {AVAILABLE_TEMPLATES.map((template) => (
          <div
            key={template.id}
            onClick={() => handleTemplateSelect(template)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTemplateSelect(template);
              }
            }}
            role="button"
            tabIndex={0}
            className="cursor-pointer"
          >
            <DocumentTemplateCard template={template} isSelected={selectedTemplate?.id === template.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
