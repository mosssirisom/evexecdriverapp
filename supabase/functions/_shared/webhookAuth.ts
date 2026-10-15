// Shared-secret check for functions that only database triggers may call.
//
// The triggers send the push_config.webhook_secret value in the
// x-webhook-secret header (same secret and header the Operator app's
// /api/push/dispatch route and notify-operator-new-booking already use).
// Plain TypeScript with no Deno or npm imports, so it can be unit-tested
// with Node (supabase/functions/tests).

/** Constant-time string comparison (does not leak where the strings differ). */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  const len = Math.max(x.length, y.length)
  let diff = x.length ^ y.length
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/**
 * True only when the request carries the expected secret. A missing or empty
 * expected secret (not configured, or the lookup failed) always refuses.
 */
export async function isTrustedTrigger(
  headers: Headers,
  loadSecret: () => Promise<string | null | undefined>,
): Promise<boolean> {
  const presented = headers.get('x-webhook-secret') ?? ''
  if (!presented) return false
  let expected: string | null | undefined
  try {
    expected = await loadSecret()
  } catch {
    return false
  }
  if (!expected) return false
  return safeEqual(presented, expected)
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
