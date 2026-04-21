/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState } from 'react';
import Modal from '../../../components/Modal/Modal';
import DocumentGenerationMultiStepForm from './Form/DocumentGenerationMultiStepForm';
import { DocumentTemplate } from '@/Interfaces';

interface DocumentGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: () => void;
}

export interface DocumentGenerationFormData {
  documentType: string;
  title: string;
  description: string;
  template: DocumentTemplate | null;
  additionalInstructions: string;
  [key: string]: unknown; // Allow dynamic fields from templates
}

export default function DocumentGenerationModal({ isOpen, onClose, onGenerate }: DocumentGenerationModalProps) {
  const [formData, setFormData] = useState<DocumentGenerationFormData>({
    documentType: 'report',
    title: '',
    description: '',
    template: null,
    additionalInstructions: '',
  });

  const handleFormDataChange = (newFormData: DocumentGenerationFormData) => {
    setFormData(newFormData);
    // Note: isValid is used by the multi-step form internally for validation
  };

  return (
    <Modal
      className="document-generation-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Document"
      width="90vw"
      height="90vh"
    >
      <DocumentGenerationMultiStepForm
        formData={formData}
        onFormDataChange={handleFormDataChange}
        onGenerate={onGenerate}
        onClose={onClose}
      />
    </Modal>
  );
}
