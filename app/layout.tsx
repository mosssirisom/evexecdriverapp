import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SwRegister } from '@/components/sw-register'

export const metadata: Metadata = {
  title: 'EV Exec Driver',
  description: 'Driver portal for EV Exec chauffeur services',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'EV Exec',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#020813',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  )
}
