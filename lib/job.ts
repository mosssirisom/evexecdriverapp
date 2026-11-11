// Pure job-screen rules (status flow, wait grace, passenger preferences).
// Kept free of React so they can be tested; the job page imports them.
import type { BookingStatus } from '@/lib/types'

// ─── Status flow ─────────────────────────────────────────────────────────────

export type StatusStep = { from: BookingStatus; to: BookingStatus; label: string }

export const STATUS_FLOW: StatusStep[] = [
  { from: 'accepted',           to: 'En Route', label: 'Head to Pickup' },
  { from: 'confirmed',          to: 'En Route', label: 'Head to Pickup' },
  { from: 'Dispatched',         to: 'En Route', label: 'Head to Pickup' },
  { from: 'En Route',           to: 'Arrived',  label: 'Arrived at Pickup' },
  { from: 'en_route',           to: 'Arrived',  label: 'Arrived at Pickup' },
  { from: 'Arrived',            to: 'Passenger On Board', label: 'Passenger On Board' },
  { from: 'arrived',            to: 'Passenger On Board', label: 'Passenger On Board' },
  { from: 'Passenger On Board', to: 'Completed', label: 'Complete Journey' },
  { from: 'active',             to: 'Completed', label: 'Complete Journey' },
  { from: 'Active',             to: 'Completed', label: 'Complete Journey' },
]

// Timestamp column to stamp when entering each status
export const TIMESTAMP_FIELD: Partial<Record<string, string>> = {
  'En Route':           'tracking_started_at',
  'Arrived':            'arrived_at',
  'Passenger On Board': 'passenger_onboard_at',
  'Completed':          'completed_at',
}

export const PROGRESS_STEPS: BookingStatus[] = ['En Route', 'Arrived', 'Passenger On Board', 'Completed']
export const STEP_LABELS: Record<string, string> = {
  'En Route':           'En Route',
  'Arrived':            'Arrived',
  'Passenger On Board': 'On Board',
  'Completed':          'Done',
}

// ─── Wait grace period ────────────────────────────────────────────────────────

export function getGraceMinutes(journeyType: string | null, flightNumber: string | null, override: number | null): number {
  if (override != null) return override
  if (flightNumber || (journeyType ?? '').toLowerCase().includes('airport')) return 60
  if ((journeyType ?? '').toLowerCase().includes('hotel')) return 30
  if ((journeyType ?? '').toLowerCase().includes('station') || (journeyType ?? '').toLowerCase().includes('train')) return 20
  return 15
}

// ─── Passenger preferences ────────────────────────────────────────────────────

export const PREF_LABELS: Record<string, string> = {
  quiet_ride:          'Quiet ride',
  no_music:            'No music',
  music_on:            'Music on',
  cool_temperature:    'Cool A/C',
  warm_temperature:    'Warm',
  water_provided:      'Water',
  help_with_luggage:   'Luggage help',
  wheelchair:          'Wheelchair',
  child_seat:          'Child seat',
  meet_and_greet:      'Meet & greet',
  name_board:          'Name board',
}

export function formatPref(pref: string): string {
  return PREF_LABELS[pref] ?? pref.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
