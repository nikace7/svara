'use client';

import type { ComponentProps } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { LoaderCircle } from 'lucide-react';

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> & {
  className?: string;
  variant?: 'primary' | 'secondary' | 'quiet' | 'destructive';
  pending?: boolean;
};

export function Button({
  variant = 'secondary',
  pending = false,
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`button button--${variant} ${className}`}
    >
      {pending && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
      {children}
    </BaseButton>
  );
}
