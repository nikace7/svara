import { AlertTriangle, CheckCircle2, Circle, CircleX } from 'lucide-react';
import type { ReactNode } from 'react';

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
}) {
  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'warning'
        ? AlertTriangle
        : tone === 'danger'
          ? CircleX
          : Circle;
  return (
    <span className={`status status--${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {children}
    </span>
  );
}
