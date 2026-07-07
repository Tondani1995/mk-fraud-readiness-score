import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex w-fit items-center rounded-full border border-mk-line bg-mk-paper px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark', className)}>
      {children}
    </span>
  );
}
