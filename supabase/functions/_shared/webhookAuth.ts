// Shared-secret check for functions that only database triggers may call.
//
// The triggers send the vault secret 'driver_alert_webhook_secret' in the
// x-webhook-secret header. The functions load the accepted values (current,
// plus the previous one during a rotation) with the service-role-only RPC
// public.driver_alert_webhook_secrets(); see migration
// evexec/supabase/migrations/20261015031000_driver_alert_webhook_secret.sql.
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

export type SecretLoader = () => Promise<string | string[] | null | undefined>

/**
 * True only when the request carries one of the accepted secrets. No
 * accepted secret (not configured, or the lookup failed) always refuses;
 * empty values are never accepted.
 */
export async function isTrustedTrigger(headers: Headers, loadSecret: SecretLoader): Promise<boolean> {
  const presented = headers.get('x-webhook-secret') ?? ''
  if (!presented) return false
  let loaded: string | string[] | null | undefined
  try {
    loaded = await loadSecret()
  } catch {
    return false
  }
  const accepted = (Array.isArray(loaded) ? loaded : [loaded]).filter((v): v is string => typeof v === 'string' && v.length > 0)
  // Compare against every accepted value (no early exit) so timing doesn't
  // reveal which one matched.
  let ok = false
  for (const v of accepted) ok = safeEqual(presented, v) || ok
  return ok
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
