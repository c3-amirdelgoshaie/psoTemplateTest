/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { navigationConfig } from '@/config/navigation';
import { NavigationItem } from '@/types/navigation';

export default function SideNav() {
  const { currentTheme, toggleTheme } = useTheme();
  const location = useLocation();
  const currentPath = location.pathname;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isActiveRoute = (item: NavigationItem): boolean => {
    if (item.path === '/' && currentPath === '/') {
      return true;
    }
    if (item.path !== '/' && currentPath.startsWith(item.path)) {
      return true;
    }
    return currentPath === item.path;
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <nav className="hidden sm:flex w-16 bg-primary border-r border-weak flex-col items-center z-20 flex-shrink-0">
        <div className="mt-3 mb-3">
          <div className="c3-logo"></div>
        </div>
        <ul className="flex flex-col gap-1 w-full flex-1">
          {navigationConfig?.map((item) => {
            const isActive = isActiveRoute(item);
            const Icon = isActive && item.iconActive ? item.iconActive : item.icon;
            return (
              <li
                key={item.id}
                className={`w-full h-10 flex items-center justify-center relative${
                  isActive ? ' bg-secondary text-primary' : ' text-secondary'
                }`}
                title={item.tooltip}
              >
                <a href={`#${item.path}`} className="flex flex-col items-center justify-center w-full">
                  <span className="w-6 h-6 flex items-center justify-center">
                    <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="text-xs text-center">{item.label}</span>
                  {item.badge && (
                    <span className="absolute top-1 right-1 bg-danger text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
        <div className="mb-4 mt-auto w-full flex flex-col items-center">
          <button
            type="button"
            className="flex flex-col items-center w-full text-secondary"
            onClick={toggleTheme}
            aria-label="Toggle theme mode"
          >
            <span className="w-8 h-8 flex items-center justify-center">
              {currentTheme === 'dark' ? (
                <Sun className="h-5 w-5" strokeWidth={2} aria-hidden />
              ) : (
                <Moon className="h-5 w-5" strokeWidth={2} aria-hidden />
              )}
            </span>
            <span className="text-xs mt-1">{currentTheme === 'dark' ? 'Light' : 'Dark'} Mode</span>
          </button>
        </div>
      </nav>

      <button
        type="button"
        onClick={toggleMenu}
        className="z-50 sm:hidden fixed top-1 left-0 z-20 px-1 bg-primary text-secondary hover:text-primary transition-colors"
        aria-label="Toggle navigation menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isMenuOpen && (
        <div
          className="sm:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={toggleMenu}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              toggleMenu();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Close navigation menu"
        />
      )}

      {isMenuOpen && (
        <nav className="sm:hidden fixed top-0 left-0 h-full w-80 bg-primary border-r border-weak z-50 overflow-y-auto">
          <div className="p-4">
            <div className="flex justify-between items-center mb-6">
              <div className="c3-logo"></div>
              <button
                type="button"
                onClick={toggleMenu}
                className="p-2 text-secondary hover:text-primary transition-colors"
                aria-label="Close navigation menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <ul className="space-y-2">
              {navigationConfig?.map((item) => {
                const isActive = isActiveRoute(item);
                const Icon = isActive && item.iconActive ? item.iconActive : item.icon;
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.path}`}
                      onClick={toggleMenu}
                      className={`flex items-center gap-3 px-4 py-3 text-base rounded-md transition-colors ${
                        isActive
                          ? 'bg-secondary text-primary'
                          : 'text-secondary hover:text-primary hover:bg-accent-weak'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto bg-danger text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8 pt-4 border-t border-weak">
              <button
                type="button"
                className="flex text-base items-center gap-3 w-full px-4 py-3 text-secondary hover:text-primary transition-colors"
                onClick={toggleTheme}
                aria-label="Toggle theme mode"
              >
                {currentTheme === 'dark' ? (
                  <Sun className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                ) : (
                  <Moon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                )}
                <span>{currentTheme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
            </div>
          </div>
        </nav>
      )}
    </>
  );
}
