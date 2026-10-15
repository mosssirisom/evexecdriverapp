import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The Chat tab was removed (14/10/2026); send old links and bookmarks home.
  async redirects() {
    return [{ source: '/chat', destination: '/dashboard', permanent: false }]
  },
}

export default nextConfig
