import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('overflow-hidden rounded-[1.35rem] border border-mk-line/90 bg-mk-paper/92 shadow-[0_18px_50px_rgba(18,16,13,0.07)]', className)}>{children}</section>;
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('border-b border-mk-line/80 px-6 py-5', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold tracking-tight text-mk-ink', className)}>{children}</h2>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-6 py-5', className)}>{children}</div>;
}
