'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { Clock, MapPin, Loader2 } from 'lucide-react'
import type { Map as LeafletMap } from 'leaflet'

interface RouteInfo {
  duration: string
  distance: string
}

async function geocode(address: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=gb`,
      { headers: { 'Accept-Language': 'en-GB' } }
    )
    const data = await res.json()
    if (data[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
    return null
  } catch {
    return null
  }
}

async function fetchRoute(from: [number, number], to: [number, number]) {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    const res = await fetch(url)
    const data = await res.json()
    if (data.code === 'Ok' && data.routes?.[0]) {
      const r = data.routes[0]
      return {
        duration: r.duration as number,
        distance: r.distance as number,
        coords: (r.geometry.coordinates as [number, number][]).map(
          ([lng, lat]) => [lat, lng] as [number, number]
        ),
      }
    }
    return null
  } catch {
    return null
  }
}

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtMiles(m: number): string {
  return `${(m / 1609.344).toFixed(1)} mi`
}

interface Props {
  pickup: string
  dropoff: string
  onNavigate: () => void
}

export function RouteMap({ pickup, dropoff, onNavigate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function init() {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return

      // Destroy any previous instance
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      })
      mapRef.current = map

      // Dark tile layer (CartoDB Dark Matter, no API key)
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 19 }
      ).addTo(map)

      const [fromCoord, toCoord] = await Promise.all([
        geocode(pickup),
        geocode(dropoff),
      ])
      if (cancelled) return

      if (!fromCoord || !toCoord) {
        setLoading(false)
        return
      }

      const route = await fetchRoute(fromCoord, toCoord)
      if (cancelled) return

      // Circle markers
      const dot = (latlng: [number, number], color: string) =>
        L.divIcon({
          html: `<div style="width:10px;height:10px;background:${color};border:2px solid white;border-radius:50%"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
          className: '',
        })

      L.marker(fromCoord, { icon: dot(fromCoord, '#10b981') }).addTo(map)
      L.marker(toCoord, { icon: dot(toCoord, '#f87171') }).addTo(map)

      if (route) {
        const poly = L.polyline(route.coords, {
          color: '#d5a538',
          weight: 3,
          opacity: 0.9,
        }).addTo(map)
        map.fitBounds(poly.getBounds(), { padding: [24, 24] })
        setRouteInfo({
          duration: fmtDuration(route.duration),
          distance: fmtMiles(route.distance),
        })
      } else {
        map.fitBounds(L.latLngBounds([fromCoord, toCoord]), { padding: [40, 40] })
      }

      setLoading(false)
    }

    init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [pickup, dropoff])

  return (
    <>
      {/* Map */}
      <div className="relative">
        <div ref={containerRef} className="w-full" style={{ height: 176 }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B1525]">
            <Loader2 size={20} className="text-white/20 animate-spin" />
          </div>
        )}
      </div>

      {/* Duration · Distance · Navigate */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/5">
        {routeInfo ? (
          <>
            <Clock size={13} className="text-white/30 flex-shrink-0" />
            <span className="text-white/70 text-sm font-medium">{routeInfo.duration}</span>
            <span className="text-white/20 text-xs">·</span>
            <MapPin size={11} className="text-white/30 flex-shrink-0" />
            <span className="text-white/50 text-xs">{routeInfo.distance}</span>
          </>
        ) : (
          !loading && <span className="text-white/20 text-xs">Route unavailable</span>
        )}
        <button
          onClick={onNavigate}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#020813]"
          style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
        >
          Navigate →
        </button>
      </div>
    </>
  )
}
