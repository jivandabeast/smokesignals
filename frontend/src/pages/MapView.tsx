import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster/dist/leaflet.markercluster-src.js'
import { api } from '../api'
import { useAuth } from '../auth'
import type { Activity } from '../types'

function makeIcon(emoji: string) {
  return L.divIcon({
    className: 'leaflet-emoji-marker',
    html: `<div>${emoji || '📍'}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function popupHtml(items: Activity[]) {
  const head = items[0]
  const title = items.length === 1
    ? `${head.activity_type.emoji || ''} ${head.activity_type.label}`
    : `${items.length} signals here`
  const place = head.place_label ? `<div class="pop-place">${escapeHtml(head.place_label)}</div>` : ''
  const rows = items
    .slice(0, 10)
    .map((a) => {
      const when = new Date(a.created_at).toLocaleString()
      const note = a.note ? ` — <em>${escapeHtml(a.note)}</em>` : ''
      return `<li>${a.activity_type.emoji || '•'} ${escapeHtml(a.activity_type.label)} <span class="muted">· ${when}</span>${note}</li>`
    })
    .join('')
  const more = items.length > 10 ? `<div class="muted small">…and ${items.length - 10} more</div>` : ''
  return `<div class="pop"><strong>${escapeHtml(title)}</strong>${place}<ul class="pop-list">${rows}</ul>${more}</div>`
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function ClusteredLayer({ items }: { items: Activity[] }) {
  const map = useMap()
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 18,
      maxClusterRadius: 50,
    })
    groupRef.current = group
    map.addLayer(group)
    return () => {
      map.removeLayer(group)
      groupRef.current = null
    }
  }, [map])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clearLayers()

    // Bucket exact-duplicate coordinates so multiple signals at the same fix
    // become a single marker whose popup lists them all.
    const buckets = new Map<string, Activity[]>()
    for (const a of items) {
      if (a.latitude == null || a.longitude == null) continue
      const key = `${a.latitude.toFixed(5)},${a.longitude.toFixed(5)}`
      const list = buckets.get(key)
      if (list) list.push(a)
      else buckets.set(key, [a])
    }

    const markers: L.Marker[] = []
    buckets.forEach((bucket) => {
      const head = bucket[0]
      const marker = L.marker([head.latitude!, head.longitude!], {
        icon: bucket.length > 1
          ? L.divIcon({
              className: 'leaflet-emoji-marker leaflet-emoji-stack',
              html: `<div>${head.activity_type.emoji || '📍'}<span class="stack-badge">${bucket.length}</span></div>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            })
          : makeIcon(head.activity_type.emoji || '📍'),
      })
      marker.bindPopup(popupHtml(bucket), { maxWidth: 260 })
      markers.push(marker)
    })
    group.addLayers(markers)

    if (markers.length > 0) {
      const bounds = group.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
      }
    }
    setTimeout(() => map.invalidateSize(), 50)
  }, [items, map])

  return null
}

export default function MapView() {
  const { user } = useAuth()
  const [items, setItems] = useState<Activity[]>([])
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Activity[]>('/activities/mine')
      .then((all) => setItems(all))
      .catch((e) => setErr(e.message || 'Failed to load'))
      .finally(() => setLoaded(true))
  }, [])

  const geolocated = useMemo(
    () => items.filter((a) => a.latitude != null && a.longitude != null),
    [items],
  )

  const totalCount = items.length
  const geoCount = geolocated.length

  return (
    <div className="stack">
      <h1>Your map</h1>

      {loaded && totalCount === 0 && (
        <div className="empty">
          You haven't sent any signals yet. Tap the <strong>+</strong> button to send your first one.
        </div>
      )}

      {loaded && totalCount > 0 && geoCount === 0 && (
        <div className="empty">
          You have {totalCount} signal{totalCount === 1 ? '' : 's'}, but none of them have location data yet.
          {!user?.location_opt_in && (
            <>
              {' '}Location sharing is currently <strong>off</strong> — enable it in your{' '}
              <a href="/profile">profile</a> and re-send a signal with the "Attach location" toggle turned on.
            </>
          )}
          {user?.location_opt_in && (
            <>
              {' '}Make sure you tap "Get current location" and grant the browser permission
              before sending the signal.
            </>
          )}
        </div>
      )}

      {err && <div className="error">{err}</div>}

      <div className="map-wrap">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          style={{ height: '60vh', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClusteredLayer items={geolocated} />
        </MapContainer>
      </div>

      {geoCount > 0 && (
        <div className="muted small">
          Showing {geoCount} of {totalCount} signal{totalCount === 1 ? '' : 's'} on the map. Tap a cluster to zoom in.
        </div>
      )}
    </div>
  )
}
