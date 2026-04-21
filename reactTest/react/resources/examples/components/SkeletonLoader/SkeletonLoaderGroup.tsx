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
import { Skeleton } from '@/components/ui/skeleton';

interface ISkeletonLoaderGroupProps {
  numberOfLoaders?: number;
  groupHeight?: number;
  variant?: 'single' | 'mixed' | 'ascending' | 'descending' | 'title-value';
  className?: string;
}

function renderLoaderStyle(style: string, _height: number, key: number) {
  const bar = (w: string, h: number) => (
    <Skeleton className="mb-2" style={{ width: w, height: h }} />
  );

  switch (style) {
    case 'ascending':
      return (
        <div className="flex flex-col" key={`loader-${key}`}>
          {bar('60%', 12)}
          {bar('80%', 16)}
          {bar('100%', 20)}
        </div>
      );
    case 'descending':
      return (
        <div className="flex flex-col" key={`loader-${key}`}>
          {bar('100%', 20)}
          {bar('80%', 16)}
          {bar('60%', 12)}
        </div>
      );
    case 'title-value':
      return (
        <div className="flex flex-col" key={`loader-${key}`}>
          {bar('60%', 12)}
          {bar('80%', 16)}
        </div>
      );
    case 'mixed':
      return (
        <div className="flex flex-col" key={`loader-${key}`}>
          {bar('60%', 12)}
          {bar('100%', 20)}
          {bar('80%', 16)}
        </div>
      );
    case 'single':
    default:
      return (
        <div className="flex flex-col" key={`loader-${key}`}>
          {bar('100%', 20)}
        </div>
      );
  }
}

export default function SkeletonLoaderGroup({
  numberOfLoaders = 1,
  groupHeight = 5,
  variant = 'mixed',
  className = '',
}: ISkeletonLoaderGroupProps) {
  return (
    <div className={`${className} flex flex-col gap-2`}>
      {[...Array(numberOfLoaders)].map((_, index) => renderLoaderStyle(variant, groupHeight, index))}
    </div>
  );
}
