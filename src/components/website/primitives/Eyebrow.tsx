type Props = { children: React.ReactNode; tone?: 'light' | 'dark'; className?: string };

/** Small uppercase section label shared by the public website. */
export function Eyebrow({ children, tone = 'light', className = '' }: Props) {
  return (
    <p
      className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${tone === 'dark' ? 'text-mk-paper' : 'text-mk-muted'} ${className}`}
    >
      {children}
    </p>
  );
}
