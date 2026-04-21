/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export interface TopNavTab {
  title: string;
  path: string;
}

interface TopNavProps {
  title?: string;
  tabs?: TopNavTab[];
}

export default function TopNav({ title, tabs }: TopNavProps) {
  const location = useLocation();
  const hasTabs = Boolean(tabs && tabs.length > 0);

  return (
    <div className="sticky top-0 z-30 flex w-full bg-primary">
      {/* min-h-9: bar height when there are no tabs; with tabs, row grows to tab strip height. */}
      <div
        className={
          hasTabs
            ? 'flex min-h-9 flex-1 items-stretch border-b border-weak pl-8 md:pl-4'
            : 'flex min-h-9 flex-1 items-center border-b border-weak pl-8 md:pl-4'
        }
      >
        <h2
          className={
            hasTabs
              ? 'flex shrink-0 items-center self-stretch pr-4 text-md font-medium leading-none'
              : 'pr-4 text-md font-medium leading-none'
          }
        >
          {title}
        </h2>
        {hasTabs && tabs ? (
          <nav className="flex flex-wrap items-end gap-4" aria-label="Section navigation">
            {tabs.map((tab) => {
              const active = location.pathname === tab.path;
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={
                    active
                      ? '-mb-px flex items-center border-b-2 border-accent pb-2 pt-2 text-sm font-medium text-primary'
                      : '-mb-px flex items-center border-b-2 border-transparent pb-2 pt-2 text-sm font-medium text-secondary hover:text-primary'
                  }
                >
                  {tab.title}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
