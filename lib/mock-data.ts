// Mock data used only by the earnings page

type DocStatus = 'valid' | 'expiring_soon' | 'expired'

interface MockDoc {
  status: DocStatus
  expiry: string
}

interface MockDriver {
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
    license: MockDoc
    insurance: MockDoc
    inspection: MockDoc
  }
}

interface MockJob {
  id: string
  status: string
  priority: 'vip' | 'priority' | 'standard'
  date: string
  scheduledTime: string
  passenger: { name: string; phone: string; company: string }
  pickup: { address: string; name: string; time: string }
  dropoff: { address: string; name: string }
  stops?: { address: string; name: string; time: string }[]
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

export const MOCK_DRIVER: MockDriver = {
  id: 'DRV-2024-089',
  name: 'James Mitchell',
  email: 'james.mitchell@evexec.co.uk',
  phone: '+44 7700 900123',
  rating: 4.9,
  totalTrips: 1247,
  vehicle: {
    make: 'Mercedes-Benz',
    model: 'EQS 450+',
    year: '2024',
    color: 'Obsidian Black',
    plate: 'EV24 EXC',
    type: 'Luxury Electric Saloon',
  },
  documents: {
    license: { status: 'valid', expiry: '2028-03-15' },
    insurance: { status: 'valid', expiry: '2026-12-31' },
    inspection: { status: 'expiring_soon', expiry: '2026-06-15' },
  },
}

export const MOCK_JOBS: MockJob[] = []

export const MOCK_EARNINGS: EarningEntry[] = [
  {
    jobId: 'JOB-2026-0831',
    date: '2026-05-29',
    passenger: 'Mr James Thornton',
    pickup: 'Barclays HQ',
    dropoff: 'LHR Terminal 5',
    baseFare: 190.00,
    tip: 30.00,
    total: 220.00,
    rating: 5,
  },
  {
    jobId: 'JOB-2026-0832',
    date: '2026-05-29',
    passenger: 'Mrs Sarah Collins',
    pickup: 'Herbert Smith Freehills',
    dropoff: 'The Ritz',
    baseFare: 85.00,
    tip: 0,
    total: 85.00,
    rating: 5,
  },
  {
    jobId: 'JOB-2026-0833',
    date: '2026-05-29',
    passenger: 'Lady Victoria Pemberton',
    pickup: 'LGW South Terminal',
    dropoff: 'Private Residence',
    baseFare: 245.00,
    tip: 50.00,
    total: 295.00,
    rating: 5,
  },
  {
    jobId: 'JOB-2026-0820',
    date: '2026-05-28',
    passenger: 'Mr David Kaur',
    pickup: 'Canary Wharf',
    dropoff: 'LHR Terminal 2',
    baseFare: 155.00,
    tip: 20.00,
    total: 175.00,
    rating: 4,
  },
  {
    jobId: 'JOB-2026-0819',
    date: '2026-05-28',
    passenger: 'Ms Elena Vasquez',
    pickup: 'The Savoy Hotel',
    dropoff: 'LCY Airport',
    baseFare: 95.00,
    tip: 15.00,
    total: 110.00,
    rating: 5,
  },
]

export const TODAY_STATS = {
  jobsCompleted: 1,
  jobsScheduled: 3,
  earningsToday: 185.00,
  hoursOnline: 4.5,
}

export const WEEK_STATS = {
  jobsCompleted: 18,
  earningsTotal: 2840.00,
  avgRating: 4.9,
  hoursOnline: 38,
}
