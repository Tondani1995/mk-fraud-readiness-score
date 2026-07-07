import { Badge } from './Badge';

export function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="mb-8 max-w-3xl">
      {eyebrow ? <Badge>{eyebrow}</Badge> : null}
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-mk-ink md:text-4xl">{title}</h1>
      {description ? <p className="mt-4 text-base leading-7 text-mk-muted">{description}</p> : null}
    </div>
  );
}
