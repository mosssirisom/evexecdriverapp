export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'Dispatched'
  | 'rejected'
  | 'cancelled'
  | 'Cancelled'
  | 'en_route'
  | 'En Route'
  | 'arrived'
  | 'Arrived'
  | 'active'
  | 'Active'
  | 'Passenger On Board'
  | 'No Show'
  | 'completed'
  | 'Completed'
  | 'CRITICAL_UNALLOCATED'

export interface Booking {
  id: string
  ref: string | null
  created_at: string
  updated_at: string | null
  journey_type: string | null
  pickup_location: string | null
  airport: string | null
  flight_number: string | null
  dropoff_address: string | null
  travel_date: string | null
  travel_time: string | null
  pickup_time: string | null
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
  // Journey timestamps (Phase 1)
  tracking_started_at: string | null
  arrived_at: string | null
  passenger_onboard_at: string | null
  completed_at: string | null
  actual_distance_miles: number | null
  actual_duration_minutes: number | null
  // Phase 2
  passenger_preferences: string[] | null
  wait_time_minutes: number | null
  // Phase 3
  flight_status: Record<string, unknown> | null
  flight_checked_at: string | null
  // Phase 4
  corporate_email: string | null
  receipt_sent_at: string | null
}

export interface BookingExpense {
  id: string
  booking_id: string
  type: 'parking' | 'ulez' | 'congestion' | 'toll' | 'airport_fee' | 'other'
  amount: number
  notes: string | null
  created_at: string
}

export interface Driver {
  id: string
  full_name: string
  phone: string | null
  vehicle_registration: string | null
  vehicle_model: string | null
  is_online: boolean
  avatar_url: string | null
}
