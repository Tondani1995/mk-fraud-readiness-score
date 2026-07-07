const PLACEHOLDER_MARKERS = ['replace', 'your-project', 'example', 'placeholder'];

export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value || PLACEHOLDER_MARKERS.some((marker) => value.toLowerCase().includes(marker))) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function getOptionalServerEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value || PLACEHOLDER_MARKERS.some((marker) => value.toLowerCase().includes(marker))) {
    return fallback;
  }
  return value;
}

export function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
