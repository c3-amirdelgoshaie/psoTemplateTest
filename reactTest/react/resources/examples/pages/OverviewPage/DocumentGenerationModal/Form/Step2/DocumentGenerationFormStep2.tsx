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
import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { OptionSelect } from '../../../../../components/OptionSelect/OptionSelect';
import { DocumentGenerationFormData } from '../../DocumentGenerationModal';

interface DocumentGenerationFormStep2Props {
  formData: DocumentGenerationFormData;
  onFormDataChange: (formData: DocumentGenerationFormData, isValid: boolean) => void;
}

interface FormData {
  title: string;
  description: string;
  priority: string;
  additionalInstructions: string;
  [key: string]: unknown;
}

export type FieldType = 'text' | 'textarea' | 'dropdown' | 'date' | 'number' | 'checkbox';

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ text: string; value: string }>;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  };
}

const TEMPLATE_FIELD_MAPPING: Record<string, FormField[]> = {
  rfp_proposal: [
    {
      name: 'application',
      label: 'Application Type',
      type: 'dropdown',
      required: true,
      options: [
        { text: 'C3 Law Enforcement', value: 'law_enforcement' },
        { text: 'C3 AI Property Appraisal', value: 'property_appraisal' },
        { text: 'C3 AI Document IQ', value: 'document_iq' },
        { text: 'C3 AI Safety IQ', value: 'safety_iq' },
      ],
    },
    {
      name: 'pointOfContact',
      label: 'Point of Contact',
      type: 'dropdown',
      required: true,
      options: [
        { text: 'John Doe', value: 'john_doe' },
        { text: 'Jane Smith', value: 'jane_smith' },
        { text: 'Srihari Parthasarathy', value: 'srihari_parthasarathy' },
        { text: 'Grant Guttschow', value: 'grant_guttschow' },
      ],
    },
    {
      name: 'numberOfCoeRequired',
      label: 'Number of CoE Required',
      type: 'number',
      required: true,
      validation: { min: 1 },
    },
  ],
  'memo-template': [
    {
      name: 'recipient',
      label: 'To (Recipient)',
      type: 'text',
      required: true,
      placeholder: 'Enter recipient name or department',
    },
    {
      name: 'sender',
      label: 'From (Sender)',
      type: 'text',
      required: true,
      placeholder: 'Enter your name or department',
    },
    {
      name: 'urgency',
      label: 'Urgency Level',
      type: 'dropdown',
      required: true,
      options: [
        { text: 'High', value: 'high' },
        { text: 'Medium', value: 'medium' },
        { text: 'Low', value: 'low' },
      ],
    },
    {
      name: 'actionRequired',
      label: 'Action Required',
      type: 'checkbox',
    },
  ],
  'proposal-template': [
    {
      name: 'clientName',
      label: 'Client Name',
      type: 'text',
      required: true,
      placeholder: 'Enter client or organization name',
    },
    {
      name: 'proposalValue',
      label: 'Proposal Value ($)',
      type: 'number',
      required: true,
      validation: { min: 0 },
    },
    {
      name: 'deliveryDate',
      label: 'Expected Delivery Date',
      type: 'date',
      required: true,
    },
    {
      name: 'scopeOfWork',
      label: 'Scope of Work Summary',
      type: 'textarea',
      required: true,
      placeholder: 'Briefly describe the scope of work...',
      validation: { minLength: 50, maxLength: 1000 },
    },
    {
      name: 'includeTimeline',
      label: 'Include Project Timeline',
      type: 'checkbox',
    },
  ],
  'letter-template': [
    {
      name: 'recipientAddress',
      label: 'Recipient Address',
      type: 'textarea',
      required: true,
      placeholder: "Enter the recipient's full address...",
    },
    {
      name: 'letterType',
      label: 'Letter Type',
      type: 'dropdown',
      required: true,
      options: [
        { text: 'Business Letter', value: 'business' },
        { text: 'Cover Letter', value: 'cover' },
        { text: 'Recommendation Letter', value: 'recommendation' },
        { text: 'Complaint Letter', value: 'complaint' },
        { text: 'Thank You Letter', value: 'thankyou' },
      ],
    },
    {
      name: 'formalTone',
      label: 'Use Formal Tone',
      type: 'checkbox',
    },
  ],
};

export default function DocumentGenerationFormStep2({ formData, onFormDataChange }: DocumentGenerationFormStep2Props) {
  const getTemplateFields = (templateId?: string): FormField[] => {
    if (!templateId) return [];
    return TEMPLATE_FIELD_MAPPING[templateId] || [];
  };

  const [formValues, setFormValues] = useState<FormData>({
    title: formData.title || '',
    description: formData.description || '',
    priority: 'medium',
    additionalInstructions: formData.additionalInstructions || '',
    ...Object.fromEntries(
      getTemplateFields(formData.template?.id).map((field) => [field.name, field.type === 'checkbox' ? false : ''])
    ),
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const renderFormField = (field: FormField) => {
    const fieldError = errors[field.name];

    switch (field.type) {
      case 'text':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className="mb-1 block text-sm font-medium text-secondary">
              {field.label}
              {field.required ? <span className="ml-1 text-warning">*</span> : null}
            </label>
            <Input
              id={field.name}
              name={field.name}
              value={String(formValues[field.name] ?? '')}
              onChange={(e) => {
                const newValue = e.target.value;
                setFormValues((prev) => ({ ...prev, [field.name]: newValue }));
                if (errors[field.name]) {
                  setErrors((prev) => ({ ...prev, [field.name]: '' }));
                }
              }}
              placeholder={field.placeholder}
              className={fieldError ? 'w-full border-warning' : 'w-full'}
            />
            {fieldError ? <span className="mt-1 text-xs text-warning">{fieldError}</span> : null}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className="mb-2 block text-sm font-medium text-secondary">
              {field.label}
              {field.required ? <span className="ml-1 text-warning">*</span> : null}
            </label>
            <Textarea
              id={field.name}
              name={field.name}
              value={String(formValues[field.name] ?? '')}
              onChange={(e) => {
                const newValue = e.target.value;
                setFormValues((prev) => ({ ...prev, [field.name]: newValue }));
                if (errors[field.name]) {
                  setErrors((prev) => ({ ...prev, [field.name]: '' }));
                }
              }}
              placeholder={field.placeholder}
              rows={3}
              className={fieldError ? 'w-full border-warning' : 'w-full'}
            />
            {fieldError ? <span className="mt-1 text-xs text-warning">{fieldError}</span> : null}
          </div>
        );

      case 'dropdown':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className="mb-2 block text-sm font-medium text-secondary">
              {field.label}
              {field.required ? <span className="ml-1 text-warning">*</span> : null}
            </label>
            <OptionSelect
              id={field.name}
              options={field.options || []}
              value={field.options?.find((opt) => opt.value === formValues[field.name]) || null}
              onChange={(item) => {
                setFormValues((prev) => ({ ...prev, [field.name]: item?.value || '' }));
                if (errors[field.name]) {
                  setErrors((prev) => ({ ...prev, [field.name]: '' }));
                }
              }}
            />
            {fieldError ? <span className="mt-1 text-xs text-warning">{fieldError}</span> : null}
          </div>
        );

      case 'date':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className="mb-2 block text-sm font-medium text-secondary">
              {field.label}
              {field.required ? <span className="ml-1 text-warning">*</span> : null}
            </label>
            <Input
              id={field.name}
              name={field.name}
              type="date"
              value={String(formValues[field.name] ?? '')}
              onChange={(e) => {
                setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }));
                if (errors[field.name]) {
                  setErrors((prev) => ({ ...prev, [field.name]: '' }));
                }
              }}
              className={fieldError ? 'w-full border-warning' : 'w-full'}
            />
            {fieldError ? <span className="mt-1 text-xs text-warning">{fieldError}</span> : null}
          </div>
        );

      case 'number':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className="mb-2 block text-sm font-medium text-secondary">
              {field.label}
              {field.required ? <span className="ml-1 text-warning">*</span> : null}
            </label>
            <Input
              id={field.name}
              name={field.name}
              type="number"
              value={formValues[field.name] === '' || formValues[field.name] === undefined ? '' : String(formValues[field.name])}
              min={field.validation?.min}
              max={field.validation?.max}
              onChange={(e) => {
                const raw = e.target.value;
                const newValue = raw === '' ? '' : Number(raw);
                setFormValues((prev) => ({ ...prev, [field.name]: newValue }));
                if (errors[field.name]) {
                  setErrors((prev) => ({ ...prev, [field.name]: '' }));
                }
              }}
              className={fieldError ? 'w-full border-warning' : 'w-full'}
            />
            {fieldError ? <span className="mt-1 text-xs text-warning">{fieldError}</span> : null}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.name} className="mb-4">
            <label htmlFor={field.name} className="flex items-center space-x-2">
              <Checkbox
                id={field.name}
                checked={!!formValues[field.name]}
                onCheckedChange={(c) => {
                  setFormValues((prev) => ({ ...prev, [field.name]: c === true }));
                  if (errors[field.name]) {
                    setErrors((prev) => ({ ...prev, [field.name]: '' }));
                  }
                }}
              />
              <span className="text-sm font-medium text-secondary">{field.label}</span>
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  useEffect(() => {
    const templateFields = getTemplateFields(formData.template?.id);

    const isFormValid =
      String(formValues.title || '').trim() !== '' &&
      String(formValues.description || '').trim() !== '' &&
      templateFields.every((field) => {
        if (!field.required) return true;
        const value = formValues[field.name];
        if (value === undefined || value === null || value === '') return false;
        if (field.type === 'number' && (value === 0 || value === '')) return false;
        return true;
      }) &&
      Object.keys(errors).every((k) => !errors[k]);

    onFormDataChange(
      {
        ...formData,
        title: String(formValues.title),
        description: String(formValues.description),
        additionalInstructions: String(formValues.additionalInstructions),
        ...Object.fromEntries(templateFields.map((field) => [field.name, formValues[field.name]])),
      },
      isFormValid
    );
  }, [formValues, formData, onFormDataChange, errors]);

  return (
    <div className="space-y-3">
      <div className="flex items-center border border-accent bg-accent-weak px-2 py-2 text-accent">
        <p className="text-xs text-primary">
          Selected Template: <span className="text-secondary">{formData.template?.name || 'None selected'}</span>
        </p>
      </div>

      <div>
        <h2 className="text-xl">Document Details</h2>
        <p className="text-sm text-secondary">Fill out the details of the document</p>
      </div>
      <div className="mb-4">
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-secondary">
          Title <span className="ml-1 text-warning">*</span>
        </label>
        <Input
          id="title"
          name="title"
          value={String(formValues.title || '')}
          onChange={(e) => {
            setFormValues((prev) => ({ ...prev, title: e.target.value }));
            if (errors.title) {
              setErrors((prev) => ({ ...prev, title: '' }));
            }
          }}
          placeholder="Enter document title..."
          className={errors.title ? 'w-full border-warning' : 'w-full'}
        />
        {errors.title ? <span className="mt-1 text-xs text-warning">{errors.title}</span> : null}
      </div>

      <div className="mb-4">
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-secondary">
          Description <span className="ml-1 text-warning">*</span>
        </label>
        <Textarea
          id="description"
          name="description"
          value={String(formValues.description || '')}
          onChange={(e) => {
            setFormValues((prev) => ({ ...prev, description: e.target.value }));
            if (errors.description) {
              setErrors((prev) => ({ ...prev, description: '' }));
            }
          }}
          placeholder="Enter document description..."
          rows={3}
          className="w-full"
        />
      </div>

      {formData.template?.id && getTemplateFields(formData.template.id).length > 0 ? (
        <div>{getTemplateFields(formData.template.id).map((field) => renderFormField(field))}</div>
      ) : null}
    </div>
  );
}
