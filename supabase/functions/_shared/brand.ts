// Whose emails these are: the business name, phone, licence, website and
// colours shown in an email's header and footer, read from the business's own
// row in public.tenants (name, contact_email, contact_phone, and in its brand
// column { licence, site_url, tagline, colors: { primary, accent } }).
//
// Same rules as the website's lib/brand.js: nothing is ever filled in from
// another business, and a detail the business has not set is left out. Pure
// code (no Deno APIs) so it can be unit-tested with Node.

export interface Brand {
  name: string
  /** Upper-case name for the email header. */
  wordmark: string
  /** Phone as people read it ("07721 070370"). */
  phone: string
  email: string
  licence: string
  /** Website address, no trailing slash. */
  site: string
  tagline: string
  primary: string | null
  accent: string | null
}

export const NO_BRAND: Brand = Object.freeze({
  name: '', wordmark: '', phone: '', email: '', licence: '', site: '', tagline: '', primary: null, accent: null,
})

const HEX = /^#[0-9a-f]{6}$/i
const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** "07721070370" and "+44 7721 070370" both read "07721 070370"; anything else as typed. */
export function displayPhone(raw: unknown): string {
  const s = clean(raw)
  if (!s) return ''
  const digits = s.replace(/[\s()-]/g, '')
  const national = digits.startsWith('+44') ? `0${digits.slice(3)}` : digits.startsWith('0044') ? `0${digits.slice(4)}` : digits
  return /^07\d{9}$/.test(national) ? `${national.slice(0, 5)} ${national.slice(5)}` : s
}

export interface TenantBrandRow {
  name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  brand?: unknown
}

export function brandFromRow(row: TenantBrandRow | null | undefined): Brand {
  if (!row) return NO_BRAND
  const b = (row.brand && typeof row.brand === 'object') ? row.brand as Record<string, unknown> : {}
  const colors = (b.colors && typeof b.colors === 'object') ? b.colors as Record<string, unknown> : {}
  const name = clean(row.name)
  const site = clean(b.site_url).replace(/\/$/, '')
  return Object.freeze({
    name,
    wordmark: name.toUpperCase(),
    phone: displayPhone(row.contact_phone),
    email: clean(row.contact_email),
    licence: clean(b.licence),
    site: /^https?:\/\//i.test(site) ? site : '',
    tagline: clean(b.tagline),
    primary: HEX.test(clean(colors.primary)) ? clean(colors.primary) : null,
    accent: HEX.test(clean(colors.accent)) ? clean(colors.accent) : null,
  })
}

// Minimal shape of the Supabase client used here, so tests can fake it.
interface TenantReader {
  from(table: 'tenants'): {
    select(cols: string): { eq(col: string, val: string): { maybeSingle(): PromiseLike<{ data: TenantBrandRow | null }> } }
  }
}

const TTL_MS = 60_000
const cache = new Map<string, { at: number; brand: Brand }>()

/**
 * The brand for a business (booking.tenant_id). Cached for a minute per
 * instance; if the lookup fails the last good copy is used, otherwise a blank
 * brand (never another business's).
 */
export async function loadBrand(supabase: unknown, tenantId: string | null | undefined): Promise<Brand> {
  if (!tenantId) return NO_BRAND
  const hit = cache.get(tenantId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.brand
  try {
    const { data } = await (supabase as TenantReader)
      .from('tenants').select('name, contact_email, contact_phone, brand').eq('id', tenantId).maybeSingle()
    const brand = brandFromRow(data)
    if (data) cache.set(tenantId, { at: Date.now(), brand })
    return data ? brand : (hit?.brand ?? NO_BRAND)
  } catch {
    return hit?.brand ?? NO_BRAND
  }
}

/** Test helper: forget cached businesses. */
export function _clearBrandCache(): void { cache.clear() }
