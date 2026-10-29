"use client";

import { formatDateTime, timeAgo } from "@/lib/utils";

/** Relative/local times differ between server and browser by design; suppress that expected mismatch. */
export function Ago({ value }: { value: string | Date | null | undefined }) {
  return <time dateTime={value ? new Date(value).toISOString() : undefined} suppressHydrationWarning>{timeAgo(value)}</time>;
}
export function When({ value }: { value: string | Date | null | undefined }) {
  return <time dateTime={value ? new Date(value).toISOString() : undefined} suppressHydrationWarning>{formatDateTime(value)}</time>;
}
