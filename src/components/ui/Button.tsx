import { cloneElement, isValidElement, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  asChild?: boolean;
  children: ReactNode;
};

export function Button({ className, variant = 'primary', asChild, children, ...props }: ButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-mk-brass focus:ring-offset-2',
    variant === 'primary' && 'bg-mk-brass text-mk-ink hover:bg-mk-brassDark hover:text-mk-cream',
    variant === 'secondary' && 'border border-mk-line bg-mk-paper text-mk-ink hover:border-mk-brass',
    variant === 'ghost' && 'text-mk-muted hover:bg-mk-paper hover:text-mk-ink',
    className
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, { className: cn(classes, child.props.className) });
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
