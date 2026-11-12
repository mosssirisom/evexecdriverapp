import { describe, it, expect } from 'vitest'
import { brandFromLookup, cleanSlug, readableOn } from './signin-brand'

describe('cleanSlug', () => {
  it('accepts a short name', () => expect(cleanSlug(' Acme-Cars ')).toBe('acme-cars'))
  it('rejects anything else', () => {
    for (const bad of ['', '-x', 'a b', 'a/b', '<script>', 'x'.repeat(41), null, 5]) expect(cleanSlug(bad)).toBeNull()
  })
})
describe('readableOn', () => {
  it('white on dark, dark on light', () => {
    expect(readableOn('#0B132B')).toBe('#ffffff')
    expect(readableOn('#D7A23F')).toBe('#020813')
    expect(readableOn('#ffffff')).toBe('#020813')
  })
})
describe('brandFromLookup', () => {
  it('builds a brand', () => {
    expect(brandFromLookup({ name: 'Acme', logo_url: 'https://x.invalid/l.png', primary: '#112233', accent: '#ff0000' }))
      .toEqual({ name: 'Acme', logoUrl: 'https://x.invalid/l.png', primary: '#112233', accent: '#ff0000', onAccent: '#ffffff' })
  })
  it('uses default colours when missing or bad', () => {
    const b = brandFromLookup({ name: 'Acme', primary: 'red', accent: null })!
    expect(b.primary).toBe('#020813')
    expect(b.accent).toBe('#d5a538')
  })
  it('drops a logo that is not https', () => {
    expect(brandFromLookup({ name: 'A', logo_url: 'javascript:alert(1)' })!.logoUrl).toBe('')
    expect(brandFromLookup({ name: 'A', logo_url: 'http://x.invalid/l.png' })!.logoUrl).toBe('')
  })
  it('gives nothing for an empty result', () => {
    expect(brandFromLookup(null)).toBeNull()
    expect(brandFromLookup({})).toBeNull()
    expect(brandFromLookup({ name: '  ' })).toBeNull()
  })
})
