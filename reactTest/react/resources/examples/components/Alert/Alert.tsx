/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';

interface AlertProps {
  type: 'success' | 'warning' | 'danger' | 'info';
  title: string;
  message: string;
  className?: string;
}

const typeStyles = {
  success: {
    bg: 'bg-success-weak',
    border: 'border-success',
    text: 'text-success',
    icon: '✓',
  },
  warning: {
    bg: 'bg-warning-weak',
    border: 'border-warning',
    text: 'text-warning',
    icon: '⚠️',
  },
  danger: {
    bg: 'bg-danger-weak',
    border: 'border-danger',
    text: 'text-danger',
    icon: '✕',
  },
  info: {
    bg: 'bg-accent-weak',
    border: 'border-accent',
    text: 'text-accent',
    icon: 'ℹ️',
  },
};

export default function Alert({ type, title, message, className = '' }: AlertProps) {
  const style = typeStyles[type];
  return (
    <div
      className={`flex items-center ${style.bg} border ${style.border} ${style.text} px-6 py-4 mb-4 rounded ${className}`}
      role="alert"
    >
      <span className="mr-3 text-2xl">{style.icon}</span>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm">{message}</div>
      </div>
    </div>
  );
}
