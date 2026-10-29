type Param = string | string[] | undefined;

export function str(value: Param): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim().slice(0, 100) : undefined;
}

export function pageNumber(value: Param): number {
  const n = Number(str(value));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function oneOf<T extends string>(value: Param, allowed: readonly T[]): T | undefined {
  const v = str(value);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function routeId(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null;
}

/** Builds `path?a=1&b=2`, dropping empty values. */
export function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) params.set(k, String(v));
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}
