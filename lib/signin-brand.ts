// How the sign-in screens look for one business: its name, logo and two colours.
// A driver reaches the app through their business's link, e.g.
//   https://<driver app>/login?b=acme-cars
// The short name (b) is remembered on the phone so later opens, the password
// screens and the installed app keep the same look. What can be shown before
// sign-in is limited by the database function business_signin_brand: name, logo
// and colours only. Anything that doesn't check out falls back to the app's own
// look (lib/brand.ts), so a bad link or a failed lookup never breaks sign-in.

export interface SigninBrand {
  name: string
  /** https address of the business's logo, or '' to use the app's own logo. */
  logoUrl: string
  /** Page background. */
  primary: string
  /** Button and focus colour. */
  accent: string
  /** Text colour that is readable on the accent colour. */
  onAccent: string
}

export const DEFAULT_COLOURS = { primary: '#020813', accent: '#d5a538' }

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/
const HEX = /^#[0-9a-fA-F]{6}$/

/** A business short name from a link or storage, or null if it isn't one. */
export function cleanSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  return SLUG.test(s) ? s : null
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** Dark or white text, whichever reads better on `hex`. */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.4 ? '#020813' : '#ffffff'
}

/** The brand for a lookup result; null if the result is empty or has no usable name. */
export function brandFromLookup(data: unknown): SigninBrand | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 100) : ''
  if (!name) return null
  const logo = typeof d.logo_url === 'string' ? d.logo_url.trim() : ''
  const primary = typeof d.primary === 'string' && HEX.test(d.primary) ? d.primary : DEFAULT_COLOURS.primary
  const accent = typeof d.accent === 'string' && HEX.test(d.accent) ? d.accent : DEFAULT_COLOURS.accent
  return {
    name,
    logoUrl: logo.startsWith('https://') ? logo : '',
    primary,
    accent,
    onAccent: readableOn(accent),
  }
}
