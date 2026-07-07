import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-mk-line bg-mk-paper p-0', className)}>{children}</section>;
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('border-b border-mk-line px-6 py-5', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold text-mk-ink', className)}>{children}</h2>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-6 py-5', className)}>{children}</div>;
}
