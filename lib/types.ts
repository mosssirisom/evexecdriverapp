export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'Cancelled'
  | 'en_route'
  | 'arrived'
  | 'active'
  | 'Active'
  | 'completed'
  | 'Completed'
  | 'Dispatched'
  | 'En Route'
  | 'Passenger On Board'
  | 'No Show'
  | 'CRITICAL_UNALLOCATED'

/** Zero-Failure Driver Attestation Loop state. See supabase/functions/attestation-engine. */
export type AttestationStatus =
  | 'not_required'
  | 'awaiting_first_attestation'
  | 'awaiting_second_attestation'
  | 'confirmed'
  | 'reallocating'
  | 'critical_unallocated'

export interface Booking {
  id: string
  created_at: string
  updated_at: string | null
  journey_type: string | null
  pickup_location: string | null
  airport: string | null
  flight_number: string | null
  dropoff_address: string | null
  travel_date: string | null
  travel_time: string | null
  passengers: number
  luggage: string | null
  return_journey: boolean
  customer_name: string
  customer_phone: string
  customer_email: string | null
  contact_method: string
  status: BookingStatus
  operator_note: string | null
  quoted_price: number | null
  payment_method: string | null
  payment_status: string
  assigned_driver_id: string | null
  driver_notes: string | null
  pickup_time: string | null
  pickup_lat: number | null
  pickup_lng: number | null
  attestation_status: AttestationStatus
  check_time: string | null
  drive_duration_minutes: number
  attestation_buffer_minutes: number
  attestation_first_gate_minutes: number
  attestation_second_gate_minutes: number
  attestation_first_deadline: string | null
  attestation_second_deadline: string | null
  first_attestation_sent_at: string | null
  second_attestation_sent_at: string | null
  driver_confirmed_at: string | null
  reallocation_count: number
  excluded_driver_ids: string[]
}

export interface Driver {
  id: string
  full_name: string
  phone: string | null
  vehicle_registration: string | null
  vehicle_model: string | null
  is_online: boolean
  avatar_url: string | null
  suspended_at: string | null
  suspended_reason: string | null
  current_lat: number | null
  current_lng: number | null
  location_updated_at: string | null
}
