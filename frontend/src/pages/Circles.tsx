import { useEffect, useState } from 'react'
import { api } from '../api'
import Avatar from '../components/Avatar'
import type { Circle, UserPublic } from '../types'

export default function Circles() {
  const [circles, setCircles] = useState<Circle[]>([])
  const [friends, setFriends] = useState<UserPublic[]>([])
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#4aa3df')
  const [newMembers, setNewMembers] = useState<number[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [c, f] = await Promise.all([
      api.get<Circle[]>('/circles'),
      api.get<UserPublic[]>('/friends'),
    ])
    setCircles(c)
    setFriends(f)
  }

  useEffect(() => {
    load()
  }, [])

  const resetNew = () => {
    setName('')
    setColor('#4aa3df')
    setNewMembers([])
    setShowNew(false)
    setMsg(null)
  }

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      await api.post('/circles', {
        name: name.trim(),
        color,
        member_ids: newMembers,
      })
      resetNew()
      await load()
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleNewMember = (id: number) => {
    setNewMembers((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const toggleMember = async (circle: Circle, friendId: number) => {
    const memberIds = circle.members.map((m) => m.id)
    const next = memberIds.includes(friendId)
      ? memberIds.filter((x) => x !== friendId)
      : [...memberIds, friendId]
    await api.patch(`/circles/${circle.id}`, { member_ids: next })
    await load()
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this circle?')) return
    await api.del(`/circles/${id}`)
    await load()
  }

  return (
    <div className="stack">
      <div className="row space">
        <h1>Circles</h1>
        {!showNew && (
          <button className="primary small-btn" onClick={() => setShowNew(true)}>
            + New
          </button>
        )}
      </div>
      <p className="muted small">
        Group your friends so you can choose who sees each signal. A friend can belong to multiple circles.
      </p>

      {showNew && (
        <section className="card new-circle">
          <div className="row wrap">
            <input
              placeholder="Circle name (e.g. Poker night)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 56 }} />
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            <span className="muted small">Add friends now (optional)</span>
            {friends.length === 0 ? (
              <div className="hint">Add some friends first — you can always edit the circle later.</div>
            ) : (
              <div className="chip-row">
                {friends.map((f) => {
                  const on = newMembers.includes(f.id)
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`chip ${on ? 'active' : ''}`}
                      onClick={() => toggleNewMember(f.id)}
                    >
                      {f.nickname}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {msg && <div className="error">{msg}</div>}
          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="secondary" onClick={resetNew} disabled={busy}>
              Cancel
            </button>
            <button className="primary" onClick={create} disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create circle'}
            </button>
          </div>
        </section>
      )}

      {circles.length === 0 && !showNew && (
        <div className="empty">No circles yet — tap "+ New" to create one.</div>
      )}

      {circles.map((c) => (
        <section key={c.id} className="card" style={{ borderLeftColor: c.color || '#4aa3df' }}>
          <div className="row space">
            <h3 style={{ margin: 0 }}>{c.name}</h3>
            <button className="danger small-btn" onClick={() => remove(c.id)}>
              Delete
            </button>
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {c.members.length} member{c.members.length === 1 ? '' : 's'}
          </div>
          {c.members.length > 0 && (
            <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
              {c.members.map((m) => (
                <span key={m.id} className="member-pill">
                  <Avatar user={m} size="small" />
                  <span>{m.nickname}</span>
                </span>
              ))}
            </div>
          )}
          <details style={{ marginTop: 10 }}>
            <summary className="muted small" style={{ cursor: 'pointer' }}>Edit members</summary>
            <div className="chip-row" style={{ marginTop: 8 }}>
              {friends.map((f) => {
                const on = c.members.some((m) => m.id === f.id)
                return (
                  <button
                    key={f.id}
                    className={`chip ${on ? 'active' : ''}`}
                    onClick={() => toggleMember(c, f.id)}
                  >
                    {f.nickname}
                  </button>
                )
              })}
              {friends.length === 0 && <span className="muted">Add friends first.</span>}
            </div>
          </details>
        </section>
      ))}
    </div>
  )
}
