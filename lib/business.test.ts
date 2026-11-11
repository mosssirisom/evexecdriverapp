import { describe, it, expect } from 'vitest'
import { telNumber, businessFromRow, loadBusiness, type Business } from './business'
import type { SupabaseClient } from '@supabase/supabase-js'

const FALLBACK: Business = { name: 'Fallback Ltd', phone: '+441111111111', whatsapp: 'https://wa.me/441111111111' }

describe('telNumber', () => {
  it('gives an international number for tel: links', () => {
    expect(telNumber('07721070370')).toBe('+447721070370')
    expect(telNumber('07721 070370')).toBe('+447721070370')
    expect(telNumber('+44 7123 456789')).toBe('+447123456789')
    expect(telNumber('0044 7123 456789')).toBe('+447123456789')
    expect(telNumber('01253 123456')).toBe('+441253123456')
  })
  it('gives nothing for blanks and things that are not numbers', () => {
    expect(telNumber(null)).toBe('')
    expect(telNumber('')).toBe('')
    expect(telNumber('call us')).toBe('')
  })
})

describe('businessFromRow', () => {
  it('uses the business row, with a wa.me link from its number', () => {
    expect(businessFromRow({ name: ' Coastal Cars ', contact_phone: '07123 456789' }, FALLBACK)).toEqual({
      name: 'Coastal Cars', phone: '+447123456789', whatsapp: 'https://wa.me/447123456789',
    })
  })
  it('EV Exec\'s row gives the numbers the app always used', () => {
    expect(businessFromRow({ name: 'EV Exec', contact_phone: '07721070370' }, FALLBACK)).toEqual({
      name: 'EV Exec', phone: '+447721070370', whatsapp: 'https://wa.me/447721070370',
    })
  })
  it('a business with no number gets none, never the fallback\'s', () => {
    const b = businessFromRow({ name: 'Bare Business', contact_phone: null }, FALLBACK)
    expect(b).toEqual({ name: 'Bare Business', phone: '', whatsapp: '' })
  })
  it('only a missing row uses the fallback', () => {
    expect(businessFromRow(null, FALLBACK)).toBe(FALLBACK)
    expect(businessFromRow(undefined, FALLBACK)).toBe(FALLBACK)
  })
})

describe('loadBusiness', () => {
  const client = (tables: Record<string, unknown>, fail = false) => ({
    from: (t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { if (fail) throw new Error('down'); return { data: tables[t] ?? null } } }) }),
    }),
  }) as unknown as SupabaseClient

  it('reads the driver\'s own business', async () => {
    const c = client({ drivers: { tenant_id: 't1' }, tenants: { name: 'Coastal Cars', contact_phone: '07123456789' } })
    expect((await loadBusiness(c, 'u1', FALLBACK)).name).toBe('Coastal Cars')
  })
  it('falls back when the driver has no business row or the lookup fails', async () => {
    expect(await loadBusiness(client({}), 'u1', FALLBACK)).toBe(FALLBACK)
    expect(await loadBusiness(client({ drivers: { tenant_id: 't1' } }), 'u1', FALLBACK)).toBe(FALLBACK)
    expect(await loadBusiness(client({}, true), 'u1', FALLBACK)).toBe(FALLBACK)
  })
})
