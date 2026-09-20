type Props = { children: React.ReactNode; tone?: 'light' | 'dark'; className?: string };

/** Small uppercase section label shared by the public website. */
export function Eyebrow({ children, tone = 'light', className = '' }: Props) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${tone === 'dark' ? 'text-[#a9d4ce]' : 'text-[#1d3658]'} ${className}`}
    >
      {children}
    </p>
  );
}
