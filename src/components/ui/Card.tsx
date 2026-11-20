import type { ReactNode, ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils/cn';

export function Card({ children, className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      {...props}
      className={cn(
        'clarity-card overflow-hidden rounded-[var(--mk-radius-panel)] border border-mk-line/90 bg-white shadow-soft',
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('border-b border-mk-line/80 px-6 py-5', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold tracking-normal text-mk-ink', className)}>{children}</h2>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-6 py-5', className)}>{children}</div>;
}
