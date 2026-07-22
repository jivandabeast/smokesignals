import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ActivityType, ActivityTypeGroup, UserOut } from '../types'

export default function Admin() {
  const [tab, setTab] = useState<'types' | 'groups' | 'users'>('types')
  return (
    <div className="stack">
      <h1>Admin</h1>
      <div className="row wrap">
        <button className={tab === 'types' ? 'primary' : 'secondary'} onClick={() => setTab('types')}>
          Activity types
        </button>
        <button className={tab === 'groups' ? 'primary' : 'secondary'} onClick={() => setTab('groups')}>
          Groups
        </button>
        <button className={tab === 'users' ? 'primary' : 'secondary'} onClick={() => setTab('users')}>
          Users
        </button>
      </div>
      {tab === 'types' && <TypesAdmin />}
      {tab === 'groups' && <GroupsAdmin />}
      {tab === 'users' && <UsersAdmin />}
    </div>
  )
}

function TypesAdmin() {
  const [types, setTypes] = useState<ActivityType[]>([])
  const [groups, setGroups] = useState<ActivityTypeGroup[]>([])
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState('#4aa3df')
  const [groupId, setGroupId] = useState<number | ''>('')
  const [msg, setMsg] = useState<string | null>(null)

  // Per-row edit state for renaming / restyling an existing type.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editColor, setEditColor] = useState('#4aa3df')

  const load = async () => {
    const [t, g] = await Promise.all([
      api.get<ActivityType[]>('/activity-types?include_inactive=true'),
      api.get<ActivityTypeGroup[]>('/activity-types/groups'),
    ])
    setTypes(t)
    setGroups(g)
  }
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!slug || !label) return
    try {
      await api.post('/activity-types', {
        slug,
        label,
        emoji,
        color,
        is_active: true,
        sort_order: 0,
        group_id: groupId === '' ? null : Number(groupId),
      })
      setSlug('')
      setLabel('')
      setEmoji('')
      setGroupId('')
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

  const globalGroups = groups.filter((g) => g.owner_id == null)

  return (
    <div className="stack">
      <section className="card">
        <h3>Add type</h3>
        <div className="row wrap">
          <input placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <input placeholder="label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input placeholder="emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ width: 70 }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <select value={groupId} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : '')} style={{ maxWidth: 180 }}>
            <option value="">No group</option>
            {globalGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji || ''} {g.name}
              </option>
            ))}
          </select>
          <button className="primary" onClick={create}>Add</button>
        </div>
        {msg && <div className="error">{msg}</div>}
      </section>

      <ul className="user-list">
        {types.map((t) => {
          const group = groups.find((g) => g.id === t.group_id)
          const isEditing = editingId === t.id
          const startEdit = () => {
            setEditingId(t.id)
            setEditLabel(t.label)
            setEditEmoji(t.emoji || '')
            setEditColor(t.color || '#4aa3df')
          }
          const cancelEdit = () => {
            setEditingId(null)
          }
          const saveEdit = async () => {
            await update(t, {
              label: editLabel.trim() || t.label,
              emoji: editEmoji || null,
              color: editColor,
            })
            setEditingId(null)
          }
          return (
            <li key={t.id} className="stack">
              {!isEditing && (
                <>
                  <div>
                    <strong>{t.emoji} {t.label}</strong> <span className="muted small">/{t.slug}</span>
                    <div className="muted small">
                      {group ? `Group: ${group.name}` : 'No group'}
                      {t.owner_id != null && ' · user-defined'}
                    </div>
                  </div>
                  <div className="row wrap">
                    <select
                      value={t.group_id ?? ''}
                      onChange={(e) => update(t, { group_id: e.target.value ? Number(e.target.value) : null })}
                      style={{ maxWidth: 160 }}
                    >
                      <option value="">No group</option>
                      {globalGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.emoji || ''} {g.name}
                        </option>
                      ))}
                    </select>
                    <button className="secondary small-btn" onClick={startEdit}>
                      Edit
                    </button>
                    <button className="secondary small-btn" onClick={() => update(t, { is_active: !t.is_active })}>
                      {t.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="danger small-btn" onClick={() => remove(t.id)}>Delete</button>
                  </div>
                </>
              )}
              {isEditing && (
                <div className="stack card" style={{ background: 'var(--surface-2)' }}>
                  <div className="muted small">Editing /{t.slug}</div>
                  <label>
                    <span>Label</span>
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                  </label>
                  <label>
                    <span>Emoji</span>
                    <input
                      value={editEmoji}
                      onChange={(e) => setEditEmoji(e.target.value)}
                      style={{ maxWidth: 80 }}
                    />
                  </label>
                  <label>
                    <span>Color</span>
                    <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} />
                  </label>
                  <div className="row">
                    <button className="primary" onClick={saveEdit}>Save</button>
                    <button className="secondary" onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function GroupsAdmin() {
  const [groups, setGroups] = useState<ActivityTypeGroup[]>([])
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState('#4aa3df')
  const [sortOrder, setSortOrder] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => setGroups(await api.get<ActivityTypeGroup[]>('/activity-types/groups'))
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!name.trim()) return
    try {
      await api.post('/activity-types/groups', {
        name: name.trim(),
        emoji: emoji || null,
        color,
        sort_order: sortOrder,
        is_active: true,
      })
      setName('')
      setEmoji('')
      setSortOrder(0)
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }
  const update = async (g: ActivityTypeGroup, patch: Partial<ActivityTypeGroup>) => {
    await api.patch(`/activity-types/groups/${g.id}`, patch)
    await load()
  }
  const remove = async (id: number) => {
    if (!confirm('Delete this group? Types in it will become ungrouped.')) return
    await api.del(`/activity-types/groups/${id}`)
    await load()
  }

  const globalGroups = groups.filter((g) => g.owner_id == null)

  return (
    <div className="stack">
      <section className="card">
        <h3>New group</h3>
        <div className="row wrap">
          <input placeholder="Name (e.g. Drinks)" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ width: 70 }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <input
            type="number"
            placeholder="sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <button className="primary" onClick={create}>Add</button>
        </div>
        {msg && <div className="error">{msg}</div>}
      </section>

      <p className="muted small">
        Users can also create their own private groups on the Post page — this list shows the shared, admin-defined ones.
      </p>
      <ul className="user-list">
        {globalGroups.map((g) => (
          <li key={g.id}>
            <div>
              <strong>{g.emoji || '📁'} {g.name}</strong>
              <div className="muted small">sort {g.sort_order} · {g.is_active ? 'active' : 'disabled'}</div>
            </div>
            <div className="row">
              <button className="secondary small-btn" onClick={() => update(g, { is_active: !g.is_active })}>
                {g.is_active ? 'Disable' : 'Enable'}
              </button>
              <button className="danger small-btn" onClick={() => remove(g.id)}>Delete</button>
            </div>
          </li>
        ))}
        {globalGroups.length === 0 && <div className="empty">No groups yet.</div>}
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
              className="secondary small-btn"
              onClick={async () => {
                await api.post(`/admin/users/${u.id}/set-active?active=${!u.is_active}`)
                await load()
              }}
            >
              {u.is_active ? 'Disable' : 'Enable'}
            </button>
            <button
              className="secondary small-btn"
              onClick={async () => {
                await api.post(`/admin/users/${u.id}/set-admin?is_admin=${!u.is_admin}`)
                await load()
              }}
            >
              {u.is_admin ? 'Revoke admin' : 'Make admin'}
            </button>
            <button
              className="danger small-btn"
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
