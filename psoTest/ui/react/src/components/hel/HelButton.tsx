import React from 'react';

export interface HelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'md' | 'sm';
  icon?: React.ReactNode;
}

/**
 * Spec-conformant button per lines 233:
 *  - Primary:     navy fill + white text
 *  - Secondary:   white + navy border
 *  - Destructive: coral fill
 */
export function HelButton({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className,
  ...rest
}: HelButtonProps) {
  const cls = ['hel-btn', `hel-btn--${variant}`, size === 'sm' ? 'hel-btn--sm' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} type={rest.type ?? 'button'} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export default HelButton;
