// Shaping helpers: contract view results may arrive as Map instances (the
// GenLayer calldata encodes dicts as key-value pairs), so every read is
// normalized once, here.

export function unmap<T = any>(value: any): T {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) obj[String(k)] = unmap(v);
    return obj as T;
  }
  if (Array.isArray(value)) return value.map(unmap) as any;
  if (value && typeof value === "object" && value.constructor === Object) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) obj[k] = unmap(v);
    return obj as T;
  }
  return value;
}

export function isTrue(v: any): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

export function isFalse(v: any): boolean {
  return v === false || v === 0 || v === "0" || v === "false";
}

export function short(address?: string | null, size = 6): string {
  if (!address) return "—";
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-4)}`;
}

export function sameAccount(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function truncate(text: string, max = 300): string {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function stripCode(message: string): { code: string; text: string } {
  const normalized = message.replace(/\s+/g, " ");
  const m = normalized.match(/\[([A-Z_]{2,})\]\s*(.*)/);
  if (!m) return { code: "", text: normalized };
  return { code: m[1], text: m[2] };
}
