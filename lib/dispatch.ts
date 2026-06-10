export type DriverJobStatus =
  | 'Dispatched'
  | 'Driver Started'
  | 'En Route'
  | 'Driver Arrived'
  | 'Passenger On Board'
  | 'Completed'
  | 'Cancelled'

export type DriverJob = {
  id: string
  ref: string
  customerName: string
  customerPhone: string | null
  pickup: string | null
  dropoff: string | null
  airport: string | null
  route: string
  flight: string | null
  pickupTime: string | null
  price: number | null
  status: DriverJobStatus | string
  paymentStatus: string | null
  notes: string | null
}

function buildPickupTime(row: Record<string, any>) {
  if (row.pickup_time) return row.pickup_time
  if (row.travel_date && row.travel_time) return `${row.travel_date}T${row.travel_time}`
  return row.travel_date || null
}

function buildRoute(row: Record<string, any>) {
  const pickup = row.pickup_location || row.pickup_address || null
  const dropoff = row.dropoff_address || row.destination || null
  const airport = row.airport || null

  if (pickup && airport) return `${pickup} → ${airport}`
  if (airport && dropoff) return `${airport} → ${dropoff}`
  return [pickup, airport, dropoff].filter(Boolean).join(' → ') || 'Route TBC'
}

export function shapeDriverJob(row: Record<string, any>): DriverJob {
  return {
    id: row.id,
    ref: row.ref || row.id,
    customerName: row.customer_name || 'Customer',
    customerPhone: row.customer_phone || null,
    pickup: row.pickup_location || row.pickup_address || null,
    dropoff: row.dropoff_address || row.destination || null,
    airport: row.airport || null,
    route: buildRoute(row),
    flight: row.flight || row.flight_number || null,
    pickupTime: buildPickupTime(row),
    price: row.price ?? row.quoted_price ?? null,
    status: row.status || 'Dispatched',
    paymentStatus: row.payment_status || null,
    notes: row.notes || null,
  }
}

export async function fetchAssignedDriverJobs(driverId: string): Promise<DriverJob[]> {
  if (!driverId) return []

  const res = await fetch(`/api/jobs?driverId=${encodeURIComponent(driverId)}`)
  if (!res.ok) throw new Error(`Failed to load assigned jobs: ${res.status}`)
  const data = await res.json()
  return data.jobs || []
}

export async function updateDriverJobStatus(jobRef: string, status: DriverJobStatus) {
  if (!jobRef) throw new Error('Missing job reference')

  const res = await fetch(`/api/jobs?ref=${encodeURIComponent(jobRef)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

  if (!res.ok) throw new Error(`Failed to update job status: ${res.status}`)
  const data = await res.json()
  return data.job || null
}
