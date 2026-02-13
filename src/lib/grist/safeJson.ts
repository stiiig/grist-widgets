export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value: unknown, fallback = "null"): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}