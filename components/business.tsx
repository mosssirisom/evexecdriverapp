'use client'

import { createContext, useContext } from 'react'
import { DEPLOYMENT_BUSINESS } from '@/lib/brand'
import type { Business } from '@/lib/business'

// The signed-in driver's business (name and dispatch number), loaded once by
// the app layout. Outside the provider it falls back to the deployment's own.
const BusinessContext = createContext<Business>(DEPLOYMENT_BUSINESS)

export function BusinessProvider({ business, children }: { business: Business; children: React.ReactNode }) {
  return <BusinessContext.Provider value={business}>{children}</BusinessContext.Provider>
}

export function useBusiness(): Business {
  return useContext(BusinessContext)
}
