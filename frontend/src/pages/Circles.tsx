import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Circle, UserPublic } from '../types'

export default function Circles() {
  const [circles, setCircles] = useState<Circle[]>([])
  const [friends, setFriends] = useState<UserPublic[]>([])
  const [name, setName] = useState('')
  const [color, setColor] = useState('#4aa3df')
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    setCircles(await api.get<Circle[]>('/circles'))
    setFriends(await api.get<UserPublic[]>('/friends'))
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!name.trim()) return
    try {
      await api.post('/circles', { name: name.trim(), color, member_ids: [] })
      setName('')
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  const toggleMember = async (circle: Circle, friendId: number) => {
    const memberIds = circle.members.map((m) => m.id)
    const next = memberIds.includes(friendId) ? memberIds.filter((x) => x !== friendId) : [...memberIds, friendId]
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
      <h1>Circles</h1>
      <p className="muted small">Group your friends so you can choose who sees each signal. A friend can belong to multiple circles.</p>

      <div className="row wrap">
        <input placeholder="New circle name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button className="primary" onClick={create}>Add</button>
      </div>
      {msg && <div className="error">{msg}</div>}

      {circles.length === 0 && <div className="empty">No circles yet.</div>}

      {circles.map((c) => (
        <section key={c.id} className="card" style={{ borderLeftColor: c.color || '#4aa3df' }}>
          <div className="row space">
            <h3>{c.name}</h3>
            <button className="danger small-btn" onClick={() => remove(c.id)}>Delete</button>
          </div>
          <div className="chip-row">
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
        </section>
      ))}
    </div>
  )
}
