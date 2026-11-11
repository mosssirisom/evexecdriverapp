// Deployment settings: the one place this app's own business name and contact
// details are written down. They are used where no signed-in driver is known
// yet (sign-in screens, app name and icon text, notification fallbacks) and as
// the fallback if a driver's business cannot be loaded.
//
// Once a driver is signed in, the app shows THEIR business's own name and
// number, read from their row in public.tenants (see lib/business.ts), so one
// deployment can serve several businesses. To run a separate branded copy of
// this app, set these in the deployment's environment; nothing else needs
// editing:
//   NEXT_PUBLIC_BRAND_NAME       business name            (default "EV Exec")
//   NEXT_PUBLIC_BRAND_PHONE      dispatch phone, +44...    (default +447721070370)
//   NEXT_PUBLIC_SUPPORT_EMAIL    "Help & Support" address  (default support@evexec.co.uk)
//   NEXT_PUBLIC_CONTACT_EMAIL    address sent to map and push services (default driver@evexec.co.uk)
//   NEXT_PUBLIC_BRAND_TAGLINE    one line under the app name (default "chauffeur services")
// The logo is public/logo.png and the icons are in public/icons.

import type { Business } from './business'

const pick = (value: string | undefined, fallback: string) => (value && value.trim() ? value.trim() : fallback)

const name = pick(process.env.NEXT_PUBLIC_BRAND_NAME, 'EV Exec')
const phone = pick(process.env.NEXT_PUBLIC_BRAND_PHONE, '+447721070370')
const supportEmail = pick(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, 'support@evexec.co.uk')

export const BRAND = {
  name,
  wordmark: name.toUpperCase(),
  tagline: pick(process.env.NEXT_PUBLIC_BRAND_TAGLINE, 'chauffeur services'),
  phone,
  whatsapp: `https://wa.me/${phone.replace(/\D/g, '')}`,
  supportEmail,
  contactEmail: pick(process.env.NEXT_PUBLIC_CONTACT_EMAIL, 'driver@evexec.co.uk'),
  loginPlaceholder: `you@${supportEmail.split('@')[1] ?? 'example.com'}`,
}

/** The business shown when a driver's own business can't be loaded. */
export const DEPLOYMENT_BUSINESS: Business = { name: BRAND.name, phone: BRAND.phone, whatsapp: BRAND.whatsapp }
