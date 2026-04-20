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
import React, { useState, useCallback } from 'react';
import { Loader2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';

import { DocumentGenerationFormData } from '../DocumentGenerationModal';
import DocumentGenerationFormStep1 from './Step1/DocumentGenerationFormStep1';
import DocumentGenerationFormStep2 from './Step2/DocumentGenerationFormStep2';

interface DocumentGenerationMultiStepFormProps {
  formData: DocumentGenerationFormData;
  onFormDataChange: (formData: DocumentGenerationFormData, isValid?: boolean) => void;
  onGenerate: () => void;
  onClose: () => void;
}

export default function DocumentGenerationMultiStepForm({
  formData,
  onFormDataChange,
  onGenerate,
  onClose,
}: DocumentGenerationMultiStepFormProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [step2IsValid, setStep2IsValid] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFormDataChange = useCallback(
    (newFormData: DocumentGenerationFormData, isValid?: boolean) => {
      if (isValid !== undefined) {
        setStep2IsValid(isValid);
      }
      onFormDataChange(newFormData, isValid);
    },
    [onFormDataChange]
  );

  const handleNextStep = useCallback(() => {
    if (currentStep === 1) {
      setCurrentStep(2);
    }
  }, [currentStep]);

  const handlePreviousStep = useCallback(() => {
    if (currentStep === 2) {
      setCurrentStep(1);
    }
  }, [currentStep]);

  const isStepValid = useCallback(() => {
    if (currentStep === 1) {
      return !!formData.template?.id;
    }
    if (currentStep === 2) {
      return step2IsValid;
    }
    return false;
  }, [currentStep, formData.template?.id, step2IsValid]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleGenerate = useCallback(async () => {
    if (isStepValid()) {
      setIsGenerating(true);
      try {
        await onGenerate();
      } finally {
        setIsGenerating(false);
      }
    }
  }, [onGenerate, isStepValid]);

  const renderActionButtons = useCallback(() => {
    if (currentStep === 1) {
      return (
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={handleCancel}
            className="w-full border border-accent px-6 py-2 text-base text-accent transition-colors hover:bg-accent hover:text-inverse sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleNextStep}
            disabled={!isStepValid()}
            className="w-full bg-accent px-6 py-2 text-base text-inverse transition-colors hover:bg-accent-hover focus:outline-none sm:w-auto"
          >
            Use Template
          </button>
        </div>
      );
    }

    if (currentStep === 2) {
      return (
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={handlePreviousStep}
            className="w-full border border-accent px-6 py-2 text-base text-accent transition-colors hover:bg-accent hover:text-inverse sm:w-auto"
            disabled={isGenerating}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="w-full border border-accent px-6 py-2 text-base text-accent transition-colors hover:bg-accent hover:text-inverse sm:w-auto"
            disabled={isGenerating}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!isStepValid() || isGenerating}
            className={cn(
              'flex w-full items-center justify-center px-6 py-2 text-base transition-colors focus:outline-none sm:w-auto',
              isStepValid() && !isGenerating
                ? 'cursor-pointer bg-accent text-inverse hover:bg-accent-hover'
                : 'cursor-not-allowed border border-strong bg-gray-300 text-secondary opacity-50'
            )}
          >
            {isGenerating ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
            Generate Document
          </button>
        </div>
      );
    }

    return null;
  }, [currentStep, handleCancel, handleNextStep, handlePreviousStep, handleGenerate, isStepValid, isGenerating]);

  return (
    <div className="document-generation-form">
      <div className="mb-4 flex border-b border-weak">
        <button
          type="button"
          className={cn(
            'flex-1 border-b-2 py-2 text-sm transition-colors',
            currentStep === 1 ? 'border-accent font-medium text-primary' : 'border-transparent text-secondary'
          )}
          onClick={() => setCurrentStep(1)}
        >
          Select Template
        </button>
        <button
          type="button"
          disabled={!formData.template?.id}
          className={cn(
            'flex-1 border-b-2 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            currentStep === 2 ? 'border-accent font-medium text-primary' : 'border-transparent text-secondary'
          )}
          onClick={() => {
            if (formData.template?.id) {
              setCurrentStep(2);
            }
          }}
        >
          Document Details
        </button>
      </div>

      <div className="mb-6">
        {currentStep === 1 && (
          <DocumentGenerationFormStep1 formData={formData} onFormDataChange={handleFormDataChange} />
        )}
        {currentStep === 2 && (
          <DocumentGenerationFormStep2 formData={formData} onFormDataChange={handleFormDataChange} />
        )}
      </div>

      <div className="modal-actions">
        <div className="flex flex-col justify-end gap-3 sm:flex-row">{renderActionButtons()}</div>
      </div>
    </div>
  );
}
