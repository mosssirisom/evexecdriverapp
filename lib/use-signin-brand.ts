'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { brandFromLookup, cleanSlug, type SigninBrand } from '@/lib/signin-brand'

const KEY = 'evx_business'

function remembered(): string | null {
  try {
    const fromLink = cleanSlug(new URLSearchParams(window.location.search).get('b'))
    if (fromLink) {
      try { window.localStorage.setItem(KEY, fromLink) } catch { /* private mode: fine */ }
      return fromLink
    }
    return cleanSlug(window.localStorage.getItem(KEY))
  } catch {
    return null
  }
}

/** The business look for the sign-in screens, or null (use the app's own). */
export function useSigninBrand(): SigninBrand | null {
  const [brand, setBrand] = useState<SigninBrand | null>(null)
  useEffect(() => {
    const slug = remembered()
    if (!slug) return
    let cancelled = false
    createClient().rpc('business_signin_brand', { p_slug: slug })
      .then(({ data }) => { if (!cancelled) setBrand(brandFromLookup(data)) }, () => {})
    return () => { cancelled = true }
  }, [])
  return brand
}
