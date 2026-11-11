import { describe, it, expect } from 'vitest'
import { isReturnLeg, paymentInfo, ukToday, formatDate, formatStampDate, formatStampTime, formatStamp, formatTime } from './format'

describe('house date and time style', () => {
  it('rearranges plain dates without parsing them', () => {
    expect(formatDate('2026-11-11')).toBe('11/11/2026')
    expect(formatDate('2026-03-01')).toBe('01/03/2026')
    expect(formatDate('2026-07-04T00:00:00Z')).toBe('04/07/2026')
  })
  it('shows a dash for missing values and leaves unknown formats alone', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate('soon')).toBe('soon')
    expect(formatTime(null)).toBe('—')
  })
  it('cuts times to 24-hour HH:MM', () => {
    expect(formatTime('09:30:00')).toBe('09:30')
    expect(formatTime('23:05')).toBe('23:05')
  })
  it('shows timestamps in UK time, summer and winter', () => {
    expect(formatStampDate('2026-07-01T23:30:00Z')).toBe('02/07/2026') // BST: already the next day
    expect(formatStampTime('2026-07-01T23:30:00Z')).toBe('00:30')
    expect(formatStamp('2026-01-15T12:00:00Z')).toBe('15/01/2026 12:00')  // GMT
    expect(formatStamp('2026-07-15T12:00:00Z')).toBe('15/07/2026 13:00')  // BST
  })
  it('never shows 24:00 at midnight', () => {
    expect(formatStampTime('2026-01-15T00:00:00Z')).toBe('00:00')
  })
})

describe('ukToday', () => {
  it('is the UK date, not the UTC one, after midnight in summer', () => {
    expect(ukToday(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02')
    expect(ukToday(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-01')
  })
})

describe('return legs and payment labels', () => {
  it('recognises the automatic return leg note', () => {
    expect(isReturnLeg('Return leg created automatically from return booking.')).toBe(true)
    expect(isReturnLeg('return leg created automatically')).toBe(true)
    expect(isReturnLeg('A normal job. Return leg created automatically')).toBe(false)
    expect(isReturnLeg(null)).toBe(false)
  })
  it('a return leg is always paid with the outbound', () => {
    expect(paymentInfo('Cash', 'Unpaid', 'Return leg created automatically').text).toBe('Paid with Outbound')
  })
  it('paid wins, cash is collected, card-like methods are paid to the office', () => {
    expect(paymentInfo('Cash', 'Paid').text).toBe('✓ Paid')
    expect(paymentInfo('Cash', 'Unpaid').text).toBe('Collect Cash')
    for (const m of ['Card', 'Stripe', 'Payment link', 'Bank Transfer']) {
      expect(paymentInfo(m, 'Unpaid').text).toBe('Paid to Office')
    }
    expect(paymentInfo('On Account', 'Unpaid').text).toBe('On Account')
  })
  it('falls back to the method as typed, or to to-be-confirmed', () => {
    expect(paymentInfo('Voucher', 'Unpaid').text).toBe('Voucher')
    expect(paymentInfo(null, null).text).toBe('Cash/Card TBC')
  })
})
