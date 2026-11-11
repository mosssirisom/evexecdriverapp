import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  customerUpdateSms, customerReminderSms, daysBetween, reminderInfo, isReminderType,
  reminderLabel, smsHref, REMINDER_TYPE, WEEK_REMINDER_TYPE,
} from './customer-sms'
import type { Booking } from './types'

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'abcdef12-0000-4000-8000-000000000000', ref: 'EVX-TEST1', customer_name: 'Jo Bloggs',
  pickup_location: '1 Test Street, Southport', airport: 'Liverpool Airport', journey_type: 'To Airport',
  travel_date: '2026-11-12', travel_time: '09:30:00', flight_number: null,
  ...over,
} as Booking)
const driver = { full_name: 'Sam Driver', vehicle_model: 'Tesla Model Y', vehicle_registration: 'ab12 cde' }

afterEach(() => vi.useRealTimers())

describe('daysBetween', () => {
  it('counts calendar days, including across month ends and clock changes', () => {
    expect(daysBetween('2026-11-11', '2026-11-12')).toBe(1)
    expect(daysBetween('2026-11-11', '2026-11-11')).toBe(0)
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)   // UK clocks go forward on 29/03/2026
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)   // and back on 25/10/2026
    expect(daysBetween('2026-11-12', '2026-11-11')).toBe(-1)
  })
})

describe('customer update texts', () => {
  it('En Route names the driver, pickup, time, car and reference', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 11, 8, 0))
    const t = customerUpdateSms('En Route', booking(), driver)!
    expect(t).toContain('Good morning Jo,')
    expect(t).toContain('This is Sam, your EV Exec driver')
    expect(t).toContain('on my way to 1 Test Street, Southport for your 09:30 pickup.')
    expect(t).toContain("I'll be in a Tesla Model Y, registration AB12 CDE.")
    expect(t).toContain('Booking ref: EVX-TEST1.')
  })
  it('mentions the flight when there is one', () => {
    const t = customerUpdateSms('En Route', booking({ flight_number: 'ezy123' }), driver)!
    expect(t).toContain('flight EZY123')
  })
  it('Arrived says so and gives the car', () => {
    const t = customerUpdateSms('Arrived', booking(), driver)!
    expect(t).toContain("I've arrived at 1 Test Street, Southport")
    expect(t).toContain("You'll find me in a Tesla Model Y")
  })
  it('sends nothing for statuses where the customer is already with the driver', () => {
    for (const s of ['Passenger On Board', 'Completed', 'No Show', 'Dispatched'] as const) {
      expect(customerUpdateSms(s, booking(), driver)).toBeNull()
    }
  })
  it('greeting follows the hour', () => {
    const at = (h: number) => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 11, h, 0)); return customerUpdateSms('Arrived', booking(), driver)! }
    expect(at(9)).toContain('Good morning')
    expect(at(12)).toContain('Good afternoon')
    expect(at(17)).toContain('Good afternoon')
    expect(at(18)).toContain('Good evening')
  })
  it('copes with no driver, no name and no car', () => {
    const t = customerUpdateSms('En Route', booking({ customer_name: undefined, travel_time: undefined }), null)!
    expect(t).toContain('This is your driver, your EV Exec driver')
    expect(t).not.toContain('undefined')
    expect(t).not.toContain('null')
    expect(t).not.toContain('pickup.')   // no time given
  })
  it('falls back to the airport, then a generic pickup point', () => {
    expect(customerUpdateSms('Arrived', booking({ pickup_location: null }), driver)).toContain('Liverpool Airport')
    expect(customerUpdateSms('Arrived', booking({ pickup_location: null, airport: null }), driver)).toContain('your pickup point')
  })
  it('uses the start of the id when there is no reference', () => {
    expect(customerUpdateSms('Arrived', booking({ ref: null }), driver)).toContain('Booking ref: ABCDEF12.')
  })
})

describe('reminders', () => {
  it('says today, tomorrow, or the number of days, in house date style', () => {
    const b = booking({ travel_date: '2026-11-12' })
    expect(customerReminderSms(b, '2026-11-12')).toContain('booked for today (12/11/2026) at 09:30')
    expect(customerReminderSms(b, '2026-11-11')).toContain('booked for tomorrow (12/11/2026) at 09:30')
    expect(customerReminderSms(b, '2026-11-06')).toContain('booked for 12/11/2026 (in 6 days) at 09:30')
  })
  it('never shows an ISO date', () => {
    expect(customerReminderSms(booking(), '2026-11-11')).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
  it('airport pickups start at the airport and track the flight', () => {
    const b = booking({ journey_type: 'From Airport', flight_number: 'ba99', airport: 'Manchester Airport' })
    const info = reminderInfo(b)
    expect(info.pickup).toBe('Manchester Airport')
    expect(info.flight).toBe('ba99')
    const t = customerReminderSms(b, '2026-11-11')
    expect(t).toContain('with you at Manchester Airport.')
    expect(t).toContain('flight BA99')
  })
  it('a journey to the airport picks up at the address and has no flight line', () => {
    const info = reminderInfo(booking({ flight_number: 'ba99' }))
    expect(info.pickup).toBe('1 Test Street, Southport')
    expect(info.flight).toBeNull()
  })
  it('copes with a missing date, time and name', () => {
    const t = customerReminderSms(booking({ travel_date: null, travel_time: null, customer_name: undefined }), '2026-11-11')
    expect(t.startsWith('Hi,')).toBe(true)
    expect(t).toContain('booked for soon.')
    expect(t).not.toContain('undefined')
  })
  it('defaults "today" to the UK date at the moment of the call', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
    expect(customerReminderSms(booking({ travel_date: '2026-11-12' }))).toContain('tomorrow')
  })
})

describe('reminder types and sms link', () => {
  it('knows the two types', () => {
    expect(REMINDER_TYPE).toBe('24hr'); expect(WEEK_REMINDER_TYPE).toBe('7day')
    expect(isReminderType('7day')).toBe(true); expect(isReminderType('24hr')).toBe(true)
    expect(isReminderType('en_route')).toBe(false); expect(isReminderType(null)).toBe(false)
    expect(reminderLabel('7day')).toBe('Week-Ahead Reminder'); expect(reminderLabel('24hr')).toBe('24hr Reminder')
  })
  it('builds a link with the text encoded and spaces removed from the number', () => {
    expect(smsHref('07700 900 123', 'Hi & bye\nOK')).toBe('sms:07700900123?&body=Hi%20%26%20bye%0AOK')
  })
})
