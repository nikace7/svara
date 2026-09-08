'use client';

import { useId } from 'react';
import type { ComponentProps } from 'react';

type FormFieldProps = ComponentProps<'input'> & {
  label: string;
  help?: string;
  error?: string | undefined;
};

export function FormField({
  label,
  help,
  error,
  id,
  required,
  className = '',
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const description = [help && `${fieldId}-help`, error && `${fieldId}-error`]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="field">
      <label htmlFor={fieldId}>
        {label}
        {required && (
          <span aria-hidden="true" className="required">
            {' '}
            *
          </span>
        )}
      </label>
      {help && (
        <p id={`${fieldId}-help`} className="field-help">
          {help}
        </p>
      )}
      <input
        {...props}
        id={fieldId}
        required={required}
        aria-invalid={!!error}
        aria-describedby={description || undefined}
        className={`input ${className}`}
      />
      {error && (
        <p id={`${fieldId}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
