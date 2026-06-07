/**
 * Rate limiting using Upstash Redis.
 *
 * Requires env vars:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * If these are not set, all checks pass (development-safe fallback).
 * Wire up Upstash credentials before production deployment.
 *
 * Limit: 60 requests per minute per IP (sliding window).
 */

import { Ratelimit } from "@upstash/ratelimit";
// Use the Edge-compatible Upstash Redis client (HTTP REST, no Node.js native APIs)
import { Redis } from "@upstash/redis/cloudflare";

let ratelimit: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }

  // Lazily initialised singleton — safe across serverless invocations within
  // the same warm instance; each cold start re-creates it (fine, stateless).
  if (!ratelimit) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      analytics: false, // keep latency low
      prefix: "clearway:rl",
    });
  }

  return ratelimit;
}

interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window. -1 when rate limiting is disabled. */
  remaining: number;
  /** ISO timestamp when the limit resets. null when disabled. */
  reset: string | null;
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const limiter = getLimiter();

  if (!limiter) {
    // Rate limiting not configured — allow all requests.
    return { allowed: true, remaining: -1, reset: null };
  }

  const { success, remaining, reset } = await limiter.limit(ip);
  return {
    allowed: success,
    remaining,
    reset: new Date(reset).toISOString(),
  };
}
