/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useEffect, useState } from 'react';

export type ThemeType = 'light' | 'dark';

/**
 * Custom hook for managing theme state and Kendo SDL theme imports
 * Dynamically imports light or dark Kendo SDL theme based on current theme
 */
export const useTheme = (): { currentTheme: ThemeType; toggleTheme: () => void } => {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('light');

  useEffect(() => {
    // Initialize theme with proper defaults
    const htmlElement = document.documentElement;

    // Clear any existing theme classes first
    htmlElement.classList.remove('dark', 'light');

    // Check for stored theme preference
    const storedTheme = localStorage.getItem('kendo-theme');

    let theme: ThemeType = 'light'; // Default to light

    if (storedTheme === 'dark') {
      theme = 'dark';
      htmlElement.classList.add('dark');
    } else if (storedTheme === 'light') {
      theme = 'light';
      // Don't add 'light' class, just ensure 'dark' is removed
    } else {
      // No stored preference, default to light
      theme = 'light';
      // Don't set localStorage here - let the user make the choice first
    }

    setCurrentTheme(theme);

    // Note: This hook is the single source of truth for theme management
    // It doesn't listen to external theme events to avoid infinite loops

    // Apply initial theme
    applyKendoTheme(theme);
  }, []);

    const applyKendoTheme = async (theme: ThemeType): Promise<void> => {
    try {
      // Note: HTML class and localStorage are now handled in toggleTheme for immediate response
      // This function only handles CSS loading

      // Find the existing Kendo SDL link element from index.html
      // Use a more specific selector to avoid conflicts
      let linkElement = document.querySelector('link[href*="kendo"][data-kendo-theme]') as HTMLLinkElement;

      // If no specific link found, try the general selector
      if (!linkElement) {
        linkElement = document.querySelector('link[href*="kendo"]') as HTMLLinkElement;
      }

      // If no existing link found, create one
      if (!linkElement) {
        linkElement = document.createElement('link');
        linkElement.rel = 'stylesheet';
        linkElement.type = 'text/css';
        linkElement.setAttribute('data-kendo-theme', 'true');
        document.head.appendChild(linkElement);
      } else {
        // If we found an existing link, make sure we're using the first one
        // and remove any duplicates that might have been created
        const allKendoLinks = document.querySelectorAll('link[href*="kendo"]');
        if (allKendoLinks.length > 1) {
          // Keep the first one, remove the rest
          for (let i = 1; i < allKendoLinks.length; i++) {
            allKendoLinks[i].remove();
          }
          linkElement = allKendoLinks[0] as HTMLLinkElement;
        }
      }

      // Update the href to point to the correct theme file
      const newHref = `styles/css/kendo-${theme}.css`;

      // Only update if the href is different to avoid unnecessary reloads
      if (linkElement.href !== window.location.origin + newHref) {
        linkElement.href = newHref;

        // Wait for the CSS to load
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            resolve(); // Continue even if timeout
          }, 10000);

          linkElement.onload = () => {
            clearTimeout(timeoutId);
            // Check if the CSS loading caused any class changes
            setTimeout(() => {
              const htmlElement = document.documentElement;
              if (htmlElement.classList.contains('light') && theme === 'dark') {
                htmlElement.classList.remove('light');
              }
            }, 100);
            resolve();
          };

          linkElement.onerror = (error) => {
            clearTimeout(timeoutId);
            reject(error);
          };
        });
      }

      // Store the theme preference
      localStorage.setItem('kendo-theme', theme);

      // Force Kendo components to re-render
      const kendoThemeEvent = new CustomEvent('kendo-theme-changed', {
        detail: { theme }
      });
      document.dispatchEvent(kendoThemeEvent);

    } catch {
      // Try fallback approach
      try {
        const fallbackLink = document.createElement('link');
        fallbackLink.rel = 'stylesheet';
        fallbackLink.type = 'text/css';
        fallbackLink.href = '/styles/css/kendo-light.css'; // Default to light theme
        document.head.appendChild(fallbackLink);
      } catch {
        // Silently fail
      }
    }
  };

  const toggleTheme = (): void => {
    const newTheme: ThemeType = currentTheme === 'light' ? 'dark' : 'light';

    // Update state immediately for UI responsiveness
    setCurrentTheme(newTheme);

    // Update HTML class immediately (synchronous)
    const htmlElement = document.documentElement;

    // Remove any existing theme classes first
    htmlElement.classList.remove('dark', 'light');

    if (newTheme === 'dark') {
      htmlElement.classList.add('dark');
    } else {
      // Don't add 'light' class - just ensure 'dark' is removed
      // This prevents conflicts with other scripts that might add 'light'
    }

        // Monitor for any external scripts trying to add 'light' class
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target as HTMLElement;
          if (target.classList.contains('light') && newTheme === 'dark') {
            target.classList.remove('light');
          }
        }
      });
    });

    // Start observing for 3 seconds to catch delayed class additions
    observer.observe(htmlElement, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => observer.disconnect(), 3000);

    // Update localStorage immediately
    localStorage.setItem('darkMode', newTheme === 'dark' ? 'true' : 'false');
    localStorage.setItem('kendo-theme', newTheme);

    // Dispatch theme change event immediately for other components
    const c3ThemeEvent = new CustomEvent('c3-theme-changed', {
      detail: { theme: newTheme }
    });
    document.dispatchEvent(c3ThemeEvent);

    // Then handle the CSS loading (asynchronous)
    applyKendoTheme(newTheme);
  };

  return { currentTheme, toggleTheme };
};
