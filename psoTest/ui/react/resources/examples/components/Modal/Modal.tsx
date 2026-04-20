/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
  height?: string;
  customHeight?: string;
  showActionsBar?: boolean;
  primaryAction?: {
    text: string;
    onClick: () => void;
    disabled?: boolean;
  };
  secondaryAction?: {
    text: string;
    onClick: () => void;
  };
  className?: string;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  width = '600px',
  customHeight,
  showActionsBar = false,
  primaryAction,
  secondaryAction,
  className = '',
}: ModalProps) {
  const handlePrimaryAction = () => {
    primaryAction?.onClick();
  };

  const handleSecondaryAction = () => {
    if (secondaryAction?.onClick) {
      secondaryAction.onClick();
    } else {
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        showClose
        className={cn(
          'flex max-h-[min(90vh,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(90vw,calc(100vw-2rem))]',
          className
        )}
        style={{
          width,
          maxWidth: width,
          ...(customHeight ? { height: customHeight, maxHeight: customHeight } : {}),
        }}
      >
        {title ? (
          <DialogHeader className="border-b border-weak px-6 py-4 text-left">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        ) : null}

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-6 py-4',
            showActionsBar && 'pb-24',
            customHeight && 'modal-scroll-area'
          )}
        >
          {children}
        </div>

        {showActionsBar ? (
          <DialogFooter className="border-t border-weak bg-background px-6 py-4 sm:justify-end">
            <div className="flex w-full flex-wrap justify-end gap-2">
              {secondaryAction ? (
                <Button type="button" variant="outline" onClick={handleSecondaryAction}>
                  {secondaryAction.text || 'Cancel'}
                </Button>
              ) : null}
              {primaryAction ? (
                <Button type="button" onClick={handlePrimaryAction} disabled={primaryAction.disabled}>
                  {primaryAction.text}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
