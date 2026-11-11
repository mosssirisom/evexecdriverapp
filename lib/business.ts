import type { SupabaseClient } from '@supabase/supabase-js'

// The business a signed-in driver works for: the name and dispatch number used
// in customer texts, receipts and the "call dispatch" buttons. It comes from the
// driver's own business row, so another business's drivers never see (or send
// customers) EV Exec's details. A detail the business has not set is blank and
// is left out, never filled in with another business's.

export interface Business {
  name: string
  /** Dispatch number for tel: links, "+447..." form. Blank if the business has none. */
  phone: string
  /** wa.me link for the dispatch number. Blank if the business has no number. */
  whatsapp: string
}

/** A UK number as "+44..." for a tel: link, or '' if it is not one. */
export function telNumber(raw: string | null | undefined): string {
  const digits = (raw ?? '').trim().replace(/[\s()-]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('0044')) return `+${digits.slice(2)}`
  if (/^0\d{9,10}$/.test(digits)) return `+44${digits.slice(1)}`
  return ''
}

export interface TenantRow {
  name?: string | null
  contact_phone?: string | null
}

/** The business for a tenants row; `fallback` only when there is no row at all. */
export function businessFromRow(row: TenantRow | null | undefined, fallback: Business): Business {
  if (!row) return fallback
  const phone = telNumber(row.contact_phone)
  return {
    name: (row.name ?? '').trim(),
    phone,
    whatsapp: phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : '',
  }
}

/** Loads the business of the signed-in driver. Any failure gives `fallback`. */
export async function loadBusiness(supabase: SupabaseClient, userId: string, fallback: Business): Promise<Business> {
  try {
    const { data: driver } = await supabase.from('drivers').select('tenant_id').eq('id', userId).maybeSingle()
    if (!driver?.tenant_id) return fallback
    const { data: tenant } = await supabase.from('tenants').select('name, contact_phone').eq('id', driver.tenant_id).maybeSingle()
    return businessFromRow(tenant, fallback)
  } catch {
    return fallback
  }
}
