import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function SectionShell({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('mx-auto max-w-7xl px-6', className)}>{children}</section>;
}
