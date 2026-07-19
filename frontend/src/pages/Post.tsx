import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import type { ActivityType, Circle } from '../types'

export default function Post() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [types, setTypes] = useState<ActivityType[]>([])
  const [circles, setCircles] = useState<Circle[]>([])
  const [selectedType, setSelectedType] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [selectedCircles, setSelectedCircles] = useState<number[]>([])
  const [shareAll, setShareAll] = useState(true)
  const [attachLocation, setAttachLocation] = useState(!!user?.location_opt_in)
  const [placeLabel, setPlaceLabel] = useState('')
  const [labelSuggested, setLabelSuggested] = useState<{ label: string; distance_m: number } | null>(null)
  const [labelTouched, setLabelTouched] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.get<ActivityType[]>('/activity-types').then(setTypes)
    api.get<Circle[]>('/circles').then(setCircles)
  }, [])

  useEffect(() => {
    if (attachLocation && !coords && 'geolocation' in navigator) {
      setLocating(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          })
          setLocating(false)
        },
        (e) => {
          setLocating(false)
          setErr(e.message)
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      )
    }
  }, [attachLocation, coords])

  useEffect(() => {
    if (!coords || labelTouched) return
    let cancelled = false
    const params = new URLSearchParams({
      latitude: String(coords.lat),
      longitude: String(coords.lon),
      accuracy: String(coords.accuracy),
    })
    api
      .get<{ place_label: string | null; distance_m: number | null }>(
        `/activities/nearby-label?${params.toString()}`,
      )
      .then((res) => {
        if (cancelled) return
        if (res.place_label && res.distance_m != null) {
          setLabelSuggested({ label: res.place_label, distance_m: res.distance_m })
          if (!placeLabel) setPlaceLabel(res.place_label)
        } else {
          setLabelSuggested(null)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [coords, labelTouched, placeLabel])

  const toggleCircle = (id: number) => {
    setSelectedCircles((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const requestLocation = () => {
    if (!navigator.geolocation) return setErr('Geolocation unavailable')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setLocating(false)
      },
      (e) => {
        setLocating(false)
        setErr(e.message)
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const submit = async () => {
    if (!selectedType) return
    setBusy(true)
    setErr(null)
    try {
      await api.post('/activities', {
        activity_type_id: selectedType,
        note: note || null,
        latitude: attachLocation && coords ? coords.lat : null,
        longitude: attachLocation && coords ? coords.lon : null,
        place_label: attachLocation && placeLabel ? placeLabel : null,
        circle_ids: shareAll ? null : selectedCircles,
      })
      nav('/')
    } catch (e: any) {
      setErr(e.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <h1>What are you up to?</h1>
      <div className="type-grid">
        {types.map((t) => (
          <button
            key={t.id}
            className={`type-tile ${selectedType === t.id ? 'active' : ''}`}
            style={{ borderColor: t.color || undefined }}
            onClick={() => setSelectedType(t.id)}
          >
            <div className="type-emoji">{t.emoji || '•'}</div>
            <div className="type-label">{t.label}</div>
          </button>
        ))}
      </div>

      <label>
        <span>Note (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="At the corner pub, come by!" />
      </label>

      {user?.location_opt_in ? (
        <div className="stack">
          <label className="row">
            <input type="checkbox" checked={attachLocation} onChange={(e) => setAttachLocation(e.target.checked)} />
            <span>Attach location</span>
          </label>
          {attachLocation && (
            <div className="stack">
              {locating && !coords && <div className="hint">Getting your location…</div>}
              {coords && (
                <div className="muted small">
                  📍 {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)} · accuracy ±{Math.round(coords.accuracy)} m
                  {coords.accuracy > 200 && (
                    <> · <span className="warn">low accuracy — label suggestions disabled</span></>
                  )}
                  {' '}<button type="button" className="link" onClick={requestLocation}>refresh</button>
                </div>
              )}
              {!coords && !locating && (
                <button className="secondary" onClick={requestLocation} type="button">
                  Get current location
                </button>
              )}
              <label>
                <span>Place label</span>
                <input
                  value={placeLabel}
                  onChange={(e) => {
                    setPlaceLabel(e.target.value)
                    setLabelTouched(true)
                  }}
                  placeholder="The Blue Goose"
                />
              </label>
              {labelSuggested && placeLabel === labelSuggested.label && (
                <div className="hint">
                  Reused <strong>{labelSuggested.label}</strong> from a previous signal {Math.round(labelSuggested.distance_m)} m away.{' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setPlaceLabel('')
                      setLabelTouched(true)
                    }}
                  >
                    clear
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="hint">
          Location sharing is off. Enable it in your <a href="/profile">profile</a> to attach a place to your signals.
        </div>
      )}

      <div className="stack">
        <label className="row">
          <input type="checkbox" checked={shareAll} onChange={(e) => setShareAll(e.target.checked)} />
          <span>Share with all friends</span>
        </label>
        {!shareAll && (
          <div className="chip-row">
            {circles.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${selectedCircles.includes(c.id) ? 'active' : ''}`}
                style={{ borderColor: c.color || undefined }}
                onClick={() => toggleCircle(c.id)}
              >
                {c.name}
              </button>
            ))}
            {circles.length === 0 && <span className="muted">No circles yet — create one under Circles.</span>}
          </div>
        )}
      </div>

      {err && <div className="error">{err}</div>}
      <button className="primary big" disabled={!selectedType || busy} onClick={submit}>
        {busy ? 'Sending…' : 'Send the signal'}
      </button>
    </div>
  )
}
