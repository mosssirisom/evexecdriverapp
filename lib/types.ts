export type JobStatus =
  | 'scheduled'
  | 'assigned'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type JobPriority = 'standard' | 'priority' | 'vip'

export interface Stop {
  address: string
  name: string
  time: string
}

export interface Job {
  id: string
  status: JobStatus
  priority: JobPriority
  date: string
  scheduledTime: string
  passenger: {
    name: string
    phone: string
    company: string
  }
  pickup: {
    address: string
    name: string
    time: string
  }
  dropoff: {
    address: string
    name: string
  }
  stops?: Stop[]
  distance: string
  estimatedDuration: string
  fare: number
  notes?: string
  vehicleRequired: string
}

export interface EarningEntry {
  jobId: string
  date: string
  passenger: string
  pickup: string
  dropoff: string
  baseFare: number
  tip: number
  total: number
  rating?: number
}

export interface Driver {
  id: string
  name: string
  email: string
  phone: string
  rating: number
  totalTrips: number
  vehicle: {
    make: string
    model: string
    year: string
    color: string
    plate: string
    type: string
  }
  documents: {
    license: { status: 'valid' | 'expiring_soon' | 'expired'; expiry: string }
    insurance: { status: 'valid' | 'expiring_soon' | 'expired'; expiry: string }
    inspection: { status: 'valid' | 'expiring_soon' | 'expired'; expiry: string }
  }
}
