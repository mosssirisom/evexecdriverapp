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
  | 'completed'
  | 'Completed'

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
