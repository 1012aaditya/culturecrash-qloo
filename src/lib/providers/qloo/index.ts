import "server-only";
import { env } from "@/lib/env";
import { QlooClient } from "./client";

export * from "./types";
export { QlooClient, type InsightsParams } from "./client";
export { DemoQlooClient } from "./fixtures";

export function qloo() {
  const e = env();
  return new QlooClient(e.QLOO_API_KEY, e.QLOO_API_URL);
}
