import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
export function Badge({children,className}:{children:ReactNode;className?:string}){return <span className={cn('inline-flex items-center text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted',className)}>{children}</span>;}
