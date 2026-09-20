import { ArrowRight } from 'lucide-react';
import TrackedLink from '@/components/website/TrackedLink';

type Variant = 'primary' | 'secondary' | 'primaryOnDark' | 'secondaryOnDark';

const variants: Record<Variant, string> = {
  primary: 'bg-[#001030] text-white hover:bg-[#1d3658]',
  secondary: 'border border-[#001030]/20 bg-white text-[#001030] hover:border-[#001030]/45',
  primaryOnDark: 'bg-white text-[#001030] hover:bg-[#e8f3f1]',
  secondaryOnDark: 'border border-white/30 text-white hover:border-white/60 hover:bg-white/5'
};

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  ctaName: string;
  placement: string;
  arrow?: boolean;
  className?: string;
};

/**
 * The one button style used for website calls to action. Labels wrap rather than clip on narrow
 * screens, and the minimum height keeps a comfortable touch target.
 */
export function CtaLink({ href, children, variant = 'primary', ctaName, placement, arrow = false, className = '' }: Props) {
  return (
    <TrackedLink
      href={href}
      ctaName={ctaName}
      placement={placement}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-center min-[360px]:px-6 text-[15px] font-semibold leading-snug transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9d4ce] focus-visible:ring-offset-2 ${variants[variant]} ${className}`}
    >
      <span>{children}</span>
      {arrow ? <ArrowRight aria-hidden="true" className="hidden h-4 w-4 shrink-0 min-[360px]:block" /> : null}
    </TrackedLink>
  );
}
