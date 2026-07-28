import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import type { ActivityType, ActivityTypeGroup, NotificationPrefs, UserOut } from '../types'

const DEFAULT_PREFS: NotificationPrefs = {
  muted_type_ids: [],
  muted_group_ids: [],
  mute_custom: false,
}

export default function NotificationPrefsPage() {
  const { user, refresh } = useAuth()
  const [types, setTypes] = useState<ActivityType[]>([])
  const [groups, setGroups] = useState<ActivityTypeGroup[]>([])
  const [prefs, setPrefs] = useState<NotificationPrefs>(user?.notification_prefs || DEFAULT_PREFS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<ActivityType[]>('/activity-types'),
      api.get<ActivityTypeGroup[]>('/activity-types/groups'),
    ]).then(([t, g]) => {
      setTypes(t)
      setGroups(g)
    })
  }, [])

  // Whenever the auth user prefs change (e.g. after save+refresh), re-sync.
  useEffect(() => {
    if (user?.notification_prefs) setPrefs(user.notification_prefs)
  }, [user?.notification_prefs])

  const globalTypes = useMemo(() => types.filter((t) => t.owner_id == null), [types])
  const globalGroups = useMemo(() => groups.filter((g) => g.owner_id == null), [groups])
  const hasCustomTypes = useMemo(() => types.some((t) => t.owner_id != null), [types])

  const toggleType = (id: number) => {
    setPrefs((p) => ({
      ...p,
      muted_type_ids: p.muted_type_ids.includes(id)
        ? p.muted_type_ids.filter((x) => x !== id)
        : [...p.muted_type_ids, id],
    }))
  }

  const toggleGroup = (id: number) => {
    setPrefs((p) => ({
      ...p,
      muted_group_ids: p.muted_group_ids.includes(id)
        ? p.muted_group_ids.filter((x) => x !== id)
        : [...p.muted_group_ids, id],
    }))
  }

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await api.patch<UserOut>('/users/me', { notification_prefs: prefs })
      await refresh()
      setMsg('Saved')
    } catch (e: any) {
      setMsg(e.message || 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  const typesByGroup = useMemo(() => {
    const map = new Map<number | null, ActivityType[]>()
    for (const t of globalTypes) {
      const key = t.group_id ?? null
      const list = map.get(key)
      if (list) list.push(t)
      else map.set(key, [t])
    }
    return map
  }, [globalTypes])

  return (
    <div className="stack">
      <h1>Notifications</h1>
      <p className="muted small">
        Turn off pings you don't want. You'll still see everything in the feed —
        this only controls which activities send a notification to you.
      </p>

      {globalGroups.map((g) => {
        const typesInGroup = typesByGroup.get(g.id) || []
        if (typesInGroup.length === 0) return null
        const groupMuted = prefs.muted_group_ids.includes(g.id)
        return (
          <section key={g.id} className="card">
            <label className="row space">
              <strong>
                {g.emoji || '📁'} {g.name}
              </strong>
              <input
                type="checkbox"
                checked={!groupMuted}
                onChange={() => toggleGroup(g.id)}
                aria-label={`Toggle ${g.name} group`}
              />
            </label>
            <div className="muted small" style={{ marginTop: 4 }}>
              {groupMuted
                ? 'Silenced — no pings for anything in this group.'
                : 'Fine-tune below.'}
            </div>
            {!groupMuted && (
              <ul className="user-list" style={{ marginTop: 8 }}>
                {typesInGroup.map((t) => {
                  const on = !prefs.muted_type_ids.includes(t.id)
                  return (
                    <li key={t.id}>
                      <div>
                        <strong>{t.emoji || '•'} {t.label}</strong>
                      </div>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleType(t.id)}
                        aria-label={`Toggle ${t.label}`}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}

      {(typesByGroup.get(null) || []).length > 0 && (
        <section className="card">
          <strong>Other</strong>
          <ul className="user-list" style={{ marginTop: 8 }}>
            {(typesByGroup.get(null) || []).map((t) => {
              const on = !prefs.muted_type_ids.includes(t.id)
              return (
                <li key={t.id}>
                  <div>
                    <strong>{t.emoji || '•'} {t.label}</strong>
                  </div>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleType(t.id)}
                    aria-label={`Toggle ${t.label}`}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <label className="row space">
          <div>
            <strong>Custom activities</strong>
            <div className="muted small">
              Friends' one-off activities (things they typed themselves).
              {hasCustomTypes ? '' : ' You haven\'t seen any of these yet.'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={!prefs.mute_custom}
            onChange={() => setPrefs((p) => ({ ...p, mute_custom: !p.mute_custom }))}
            aria-label="Toggle custom activity notifications"
          />
        </label>
      </section>

      {msg && <div className="hint">{msg}</div>}
      <button className="primary" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save preferences'}
      </button>
    </div>
  )
}
