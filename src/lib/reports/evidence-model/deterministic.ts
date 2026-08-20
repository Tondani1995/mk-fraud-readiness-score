export function stableUnique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((a, b) => a.localeCompare(b));
}

export function stableToken(value: string): string {
  const normalised = value.normalize('NFKC').trim().toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < normalised.length; index += 1) {
    hash ^= normalised.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const slug = normalised.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'item';
  return `${slug.toUpperCase()}-${(hash >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
}

export function periodDays(period: '30 days' | '60 days' | '90 days'): number {
  return period === '30 days' ? 30 : period === '60 days' ? 60 : 90;
}

export function earliestPeriod<T extends '30 days' | '60 days' | '90 days'>(periods: T[]): T {
  return [...periods].sort((a, b) => periodDays(a) - periodDays(b))[0] ?? ('90 days' as T);
}
