import { BRAND } from '@/lib/brand'

// The web app manifest, served at /manifest.json (the address installed copies
// of the app already use). Name and description come from the deployment's
// brand settings (lib/brand.ts) instead of a fixed file.
export const dynamic = 'force-static'

export function GET() {
  const manifest = {
    name: `${BRAND.name} Driver`,
    short_name: BRAND.name,
    description: `Driver portal for ${BRAND.name} ${BRAND.tagline}`,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#020813',
    theme_color: '#020813',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'content-type': 'application/manifest+json' },
  })
}
