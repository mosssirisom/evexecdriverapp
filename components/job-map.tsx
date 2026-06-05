'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, Route, Navigation2 } from 'lucide-react'
import { CONTACT_EMAIL } from '@/lib/config'

interface Props {
  pickup: string
  dropoff: string
}

type LatLng = [number, number]

async function geocode(address: string): Promise<LatLng | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { 'User-Agent': `EVExecDriverApp/1.0 ${CONTACT_EMAIL}` } }
    )
    const data = await res.json()
    if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
  } catch { /* fall through */ }
  return null
}

async function getRoute(from: LatLng, to: LatLng) {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    )
    const data = await res.json()
    if (data?.routes?.[0]) {
      const route = data.routes[0]
      return {
        coords: route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as LatLng),
        distance: route.distance as number,
        duration: route.duration as number,
      }
    }
  } catch { /* fall through */ }
  return null
}

export function JobMap({ pickup, dropoff }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)
  const [eta, setEta] = useState<string | null>(null)
  const [dist, setDist] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const invalid = !pickup || pickup === '—' || !dropoff || dropoff === '—'
    if (invalid) { setLoading(false); setFailed(true); return }

    let cancelled = false

    const init = async () => {
      const L = (await import('leaflet')).default

      if (cancelled || !mapRef.current) return

      // Fix marker icon paths broken by bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const [pickupLL, dropoffLL] = await Promise.all([geocode(pickup), geocode(dropoff)])
      if (cancelled || !mapRef.current) return

      if (!pickupLL || !dropoffLL) { setLoading(false); setFailed(true); return }

      if (mapInstanceRef.current) { mapInstanceRef.current.remove() }

      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false })
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

      const greenDot = L.divIcon({
        className: '',
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#10b981;border:2.5px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.5)"></div>',
        iconSize: [14, 14], iconAnchor: [7, 7],
      })
      const redDot = L.divIcon({
        className: '',
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#f87171;border:2.5px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.5)"></div>',
        iconSize: [14, 14], iconAnchor: [7, 7],
      })

      L.marker(pickupLL, { icon: greenDot }).addTo(map)
      L.marker(dropoffLL, { icon: redDot }).addTo(map)

      const route = await getRoute(pickupLL, dropoffLL)
      if (cancelled) return

      const bounds = L.latLngBounds([pickupLL, dropoffLL])
      if (route) {
        L.polyline(route.coords, { color: '#d5a538', weight: 4, opacity: 0.85 }).addTo(map)
        map.fitBounds(bounds, { padding: [28, 28] })
        const mins = Math.round(route.duration / 60)
        setEta(mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`)
        setDist(`${(route.distance / 1000).toFixed(1)} km`)
      } else {
        map.fitBounds(bounds, { padding: [40, 40] })
      }

      setLoading(false)
    }

    init()

    return () => {
      cancelled = true
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }
    }
  }, [pickup, dropoff])

  if (failed) return null

  return (
    <div className="bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden">
      <div className="relative" style={{ height: 200 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B1525] z-10">
            <div className="w-6 h-6 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
          </div>
        )}
        <div ref={mapRef} className="h-full w-full" />
      </div>
      {(eta || dist) && (
        <div className="flex items-center gap-4 px-4 py-3 border-t border-white/5">
          {eta && (
            <span className="flex items-center gap-1.5 text-white/50 text-xs">
              <Clock size={11} className="text-[#d5a538]" /> {eta}
            </span>
          )}
          {dist && (
            <span className="flex items-center gap-1.5 text-white/50 text-xs">
              <Route size={11} className="text-[#d5a538]" /> {dist}
            </span>
          )}
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(dropoff)}&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[#d5a538] text-xs font-semibold active:opacity-70"
          >
            <Navigation2 size={11} /> Open Maps
          </a>
        </div>
      )}
    </div>
  )
}
