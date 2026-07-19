import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ActivityType, UserOut } from '../types'

export default function Admin() {
  const [tab, setTab] = useState<'types' | 'users'>('types')
  return (
    <div className="stack">
      <h1>Admin</h1>
      <div className="row">
        <button className={tab === 'types' ? 'primary' : 'secondary'} onClick={() => setTab('types')}>Activity types</button>
        <button className={tab === 'users' ? 'primary' : 'secondary'} onClick={() => setTab('users')}>Users</button>
      </div>
      {tab === 'types' ? <TypesAdmin /> : <UsersAdmin />}
    </div>
  )
}

function TypesAdmin() {
  const [types, setTypes] = useState<ActivityType[]>([])
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState('#4aa3df')
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => setTypes(await api.get<ActivityType[]>('/activity-types?include_inactive=true'))
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!slug || !label) return
    try {
      await api.post('/activity-types', { slug, label, emoji, color, is_active: true, sort_order: 0 })
      setSlug(''); setLabel(''); setEmoji('')
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }
  const update = async (t: ActivityType, patch: Partial<ActivityType>) => {
    await api.patch(`/activity-types/${t.id}`, patch)
    await load()
  }
  const remove = async (id: number) => {
    if (!confirm('Delete this activity type? Existing activities using it will be broken.')) return
    await api.del(`/activity-types/${id}`)
    await load()
  }

  return (
    <div className="stack">
      <section className="card">
        <h3>Add type</h3>
        <div className="row wrap">
          <input placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <input placeholder="label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input placeholder="emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ width: 70 }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <button className="primary" onClick={create}>Add</button>
        </div>
        {msg && <div className="error">{msg}</div>}
      </section>

      <ul className="user-list">
        {types.map((t) => (
          <li key={t.id}>
            <div>
              <strong>{t.emoji} {t.label}</strong> <span className="muted small">/{t.slug}</span>
            </div>
            <div className="row">
              <button className="secondary" onClick={() => update(t, { is_active: !t.is_active })}>
                {t.is_active ? 'Disable' : 'Enable'}
              </button>
              <button className="danger" onClick={() => remove(t.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UsersAdmin() {
  const [users, setUsers] = useState<UserOut[]>([])
  const load = async () => setUsers(await api.get<UserOut[]>('/admin/users'))
  useEffect(() => {
    load()
  }, [])

  return (
    <ul className="user-list">
      {users.map((u) => (
        <li key={u.id}>
          <div>
            <strong>{u.nickname}</strong> <span className="muted small">@{u.username} · {u.email}</span>
            <div className="muted small">{u.is_admin ? '👑 admin' : ''} {u.is_active ? '' : '· disabled'}</div>
          </div>
          <div className="row">
            <button
              className="secondary"
              onClick={async () => {
                await api.post(`/admin/users/${u.id}/set-active?active=${!u.is_active}`)
                await load()
              }}
            >
              {u.is_active ? 'Disable' : 'Enable'}
            </button>
            <button
              className="secondary"
              onClick={async () => {
                await api.post(`/admin/users/${u.id}/set-admin?is_admin=${!u.is_admin}`)
                await load()
              }}
            >
              {u.is_admin ? 'Revoke admin' : 'Make admin'}
            </button>
            <button
              className="danger"
              onClick={async () => {
                if (!confirm('Delete user?')) return
                await api.del(`/admin/users/${u.id}`)
                await load()
              }}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
