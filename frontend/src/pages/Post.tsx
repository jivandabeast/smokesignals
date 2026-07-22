import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import Modal from '../components/Modal'
import EditTypeForm from '../components/EditTypeForm'
import EditGroupForm from '../components/EditGroupForm'
import type { ActivityType, ActivityTypeGroup, Circle } from '../types'

interface CustomTypeDraft {
  label: string
  emoji: string
  color: string
  group_id: number | null
}

export default function Post() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [types, setTypes] = useState<ActivityType[]>([])
  const [groups, setGroups] = useState<ActivityTypeGroup[]>([])
  const [circles, setCircles] = useState<Circle[]>([])
  const [selectedType, setSelectedType] = useState<number | null>(null)
  const [activeGroup, setActiveGroup] = useState<'all' | 'ungrouped' | number>('all')
  const [note, setNote] = useState('')
  const [durationMin, setDurationMin] = useState<number | null>(60)
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

  const [showCustom, setShowCustom] = useState(false)
  const [customDraft, setCustomDraft] = useState<CustomTypeDraft>({
    label: '',
    emoji: '',
    color: '#4aa3df',
    group_id: null,
  })
  const [creatingCustom, setCreatingCustom] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupEmoji, setNewGroupEmoji] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)

  const [editingType, setEditingType] = useState<ActivityType | null>(null)
  const [editingGroup, setEditingGroup] = useState<ActivityTypeGroup | null>(null)

  const loadTypes = async () => {
    const [t, g] = await Promise.all([
      api.get<ActivityType[]>('/activity-types'),
      api.get<ActivityTypeGroup[]>('/activity-types/groups'),
    ])
    setTypes(t)
    setGroups(g)
  }

  useEffect(() => {
    loadTypes()
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

  const visibleTypes = useMemo(() => {
    if (activeGroup === 'all') return types
    if (activeGroup === 'ungrouped') return types.filter((t) => t.group_id == null)
    return types.filter((t) => t.group_id === activeGroup)
  }, [types, activeGroup])

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

  const createCustomType = async () => {
    if (!customDraft.label.trim()) return
    setCreatingCustom(true)
    try {
      const created = await api.post<ActivityType>('/activity-types/mine', {
        label: customDraft.label.trim(),
        emoji: customDraft.emoji || null,
        color: customDraft.color,
        group_id: customDraft.group_id,
      })
      await loadTypes()
      setSelectedType(created.id)
      setShowCustom(false)
      setCustomDraft({ label: '', emoji: '', color: '#4aa3df', group_id: null })
    } catch (e: any) {
      setErr(e.message || 'Failed to create')
    } finally {
      setCreatingCustom(false)
    }
  }

  const createCustomGroup = async () => {
    if (!newGroupName.trim()) return
    try {
      const g = await api.post<ActivityTypeGroup>('/activity-types/groups/mine', {
        name: newGroupName.trim(),
        emoji: newGroupEmoji || null,
        color: customDraft.color,
        sort_order: 0,
        is_active: true,
      })
      await loadTypes()
      setCustomDraft((d) => ({ ...d, group_id: g.id }))
      setNewGroupName('')
      setNewGroupEmoji('')
      setShowNewGroup(false)
    } catch (e: any) {
      setErr(e.message || 'Failed to create group')
    }
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
        duration_minutes: durationMin,
        circle_ids: shareAll ? null : selectedCircles,
      })
      nav('/')
    } catch (e: any) {
      setErr(e.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveType = (updatedType: ActivityType) => {
    setTypes(types.map(t => t.id === updatedType.id ? updatedType : t));
    setEditingType(null);
  };

  const handleDeleteType = (typeId: number) => {
    setTypes(types.filter(t => t.id !== typeId));
    setEditingType(null);
  };

  const handleSaveGroup = (updatedGroup: ActivityTypeGroup) => {
    setGroups(groups.map(g => g.id === updatedGroup.id ? updatedGroup : g));
    setEditingGroup(null);
  };

  const handleDeleteGroup = (groupId: number) => {
    setGroups(groups.filter(g => g.id !== groupId));
    setEditingGroup(null);
  };

  return (
    <div className="stack">
      <h1>What are you up to?</h1>

      {groups.length > 0 && (
        <div className="chip-row group-tabs">
          <button
            className={`chip ${activeGroup === 'all' ? 'active' : ''}`}
            onClick={() => setActiveGroup('all')}
          >
            All
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              className={`chip ${activeGroup === g.id ? 'active' : ''}`}
              onClick={() => setActiveGroup(g.id)}
              style={activeGroup === g.id ? undefined : { borderColor: g.color || undefined }}
            >
              {g.emoji || '📁'} {g.name}
              {g.owner_id != null && (
                <button className="icon-btn x-small" style={{ marginLeft: 4 }} onClick={(e) => { e.stopPropagation(); setEditingGroup(g); }}>✏️</button>
              )}
            </button>
          ))}
          <button
            className={`chip ${activeGroup === 'ungrouped' ? 'active' : ''}`}
            onClick={() => setActiveGroup('ungrouped')}
          >
            Other
          </button>
        </div>
      )}

      <div className="type-grid">
        {visibleTypes.map((t) => (
          <button
            key={t.id}
            className={`type-tile ${selectedType === t.id ? 'active' : ''}`}
            style={{ borderColor: t.color || undefined }}
            onClick={() => setSelectedType(t.id)}
          >
            <div className="type-emoji">{t.emoji || '•'}</div>
            <div className="type-label">{t.label}</div>
            {t.owner_id != null && (
              <div className="type-badge">
                custom
                <button className="icon-btn small" onClick={(e) => { e.stopPropagation(); setEditingType(t); }}>✏️</button>
              </div>
            )}
          </button>
        ))}
        <button
          type="button"
          className="type-tile type-tile-add"
          onClick={() => setShowCustom((v) => !v)}
        >
          <div className="type-emoji">＋</div>
          <div className="type-label">Something else</div>
        </button>
      </div>

      {showCustom && (
        <section className="card">
          <div className="row space">
            <strong>Create your own</strong>
            <button className="link" onClick={() => setShowCustom(false)}>close</button>
          </div>
          <p className="muted small">
            Private to you. Great for one-off things like "watching the game" or "open invite to swim".
          </p>
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="row wrap">
              <input
                placeholder="What are you doing?"
                value={customDraft.label}
                onChange={(e) => setCustomDraft({ ...customDraft, label: e.target.value })}
                style={{ flex: 1, minWidth: 200 }}
              />
              <input
                placeholder="🏊"
                value={customDraft.emoji}
                onChange={(e) => setCustomDraft({ ...customDraft, emoji: e.target.value })}
                style={{ width: 70 }}
              />
              <input
                type="color"
                value={customDraft.color}
                onChange={(e) => setCustomDraft({ ...customDraft, color: e.target.value })}
                style={{ width: 56 }}
              />
            </div>
            {groups.length > 0 && (
              <label>
                <span>Group (optional)</span>
                <select
                  value={customDraft.group_id ?? ''}
                  onChange={(e) =>
                    setCustomDraft({
                      ...customDraft,
                      group_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">— None —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.emoji || ''} {g.name}
                      {g.owner_id != null ? ' (yours)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {showNewGroup ? (
              <div className="stack" style={{ padding: 10, borderRadius: 10, border: '1px dashed var(--border)' }}>
                <span className="muted small">New private group</span>
                <div className="row wrap">
                  <input
                    placeholder="Group name (e.g. Watch parties)"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    style={{ flex: 1, minWidth: 180 }}
                  />
                  <input
                    placeholder="📺"
                    value={newGroupEmoji}
                    onChange={(e) => setNewGroupEmoji(e.target.value)}
                    style={{ width: 70 }}
                  />
                </div>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="secondary small-btn" onClick={() => setShowNewGroup(false)}>
                    Cancel
                  </button>
                  <button
                    className="primary small-btn"
                    disabled={!newGroupName.trim()}
                    onClick={createCustomGroup}
                  >
                    Add group
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="link" onClick={() => setShowNewGroup(true)}>
                + New group of my own
              </button>
            )}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button
                className="primary"
                disabled={creatingCustom || !customDraft.label.trim()}
                onClick={createCustomType}
              >
                {creatingCustom ? 'Saving…' : 'Save & select'}
              </button>
            </div>
          </div>
        </section>
      )}

      <label>
        <span>Note (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="At the corner pub, come by!"
        />
      </label>

      <div className="stack">
        <span className="muted small">How long should this stay active?</span>
        <div className="chip-row">
          {[
            { m: 30, label: '30 min' },
            { m: 60, label: '1 hr' },
            { m: 120, label: '2 hr' },
            { m: 240, label: '4 hr' },
            { m: null, label: 'Until I stop' },
          ].map((opt) => (
            <button
              key={String(opt.m)}
              type="button"
              className={`chip ${durationMin === opt.m ? 'active' : ''}`}
              onClick={() => setDurationMin(opt.m)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {user?.location_opt_in ? (
        <div className="stack">
          <label className="row">
            <input
              type="checkbox"
              checked={attachLocation}
              onChange={(e) => setAttachLocation(e.target.checked)}
            />
            <span>Attach location</span>
          </label>
          {attachLocation && (
            <div className="stack">
              {locating && !coords && <div className="hint">Getting your location…</div>}
              {coords && (
                <div className="muted small">
                  📍 {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)} · accuracy ±
                  {Math.round(coords.accuracy)} m
                  {coords.accuracy > 200 && (
                    <> · <span className="warn">low accuracy — label suggestions disabled</span></>
                  )}{' '}
                  <button type="button" className="link" onClick={requestLocation}>
                    refresh
                  </button>
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
                  Reused <strong>{labelSuggested.label}</strong> from a previous signal{' '}
                  {Math.round(labelSuggested.distance_m)} m away.{' '}
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
            {circles.length === 0 && (
              <span className="muted">No circles yet — create one under Circles.</span>
            )}
          </div>
        )}
      </div>

      {err && <div className="error">{err}</div>}
      <button className="primary big" disabled={!selectedType || busy} onClick={submit}>
        {busy ? 'Sending…' : 'Send the signal'}
      </button>

      {editingType && (
        <Modal title="Edit Status" onClose={() => setEditingType(null)}>
          <EditTypeForm
            type={editingType}
            groups={groups}
            onSave={handleSaveType}
            onDelete={handleDeleteType}
            onClose={() => setEditingType(null)}
          />
        </Modal>
      )}

      {editingGroup && (
        <Modal title="Edit Group" onClose={() => setEditingGroup(null)}>
          <EditGroupForm
            group={editingGroup}
            onSave={handleSaveGroup}
            onDelete={handleDeleteGroup}
            onClose={() => setEditingGroup(null)}
          />
        </Modal>
      )}
    </div>
  )
}
