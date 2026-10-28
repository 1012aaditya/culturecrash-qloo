import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", opts).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined) {
  return formatDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(value: string | Date | null | undefined) {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDate(value);
}

export function initials(name: string | null | undefined, fallback = "?") {
  if (!name) return fallback;
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || fallback;
}

/** Stable small hash for deterministic art direction from ids/names. */
export function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
