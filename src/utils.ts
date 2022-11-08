export function getTimestamp(value?: string | Date): number {
  const date = value ? new Date(value) : new Date();
  return date.getTime() * 1e-3;
}

export function getIsoDate(value?: string | number | Date): string {
  const date = value ? new Date(typeof value === "number" ? value * 1e3 : value) : new Date();
  return date.toISOString();
}

export function orDefault<T>(value: T | null, or: T): T {
  return value != null ? value : or;
}
