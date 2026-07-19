import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Activity } from '../types'
import ActivityCard from '../components/ActivityCard'

export default function History() {
  const [items, setItems] = useState<Activity[] | null>(null)

  useEffect(() => {
    api.get<Activity[]>('/activities/mine').then(setItems)
  }, [])

  const del = async (id: number) => {
    if (!confirm('Delete this entry?')) return
    await api.del(`/activities/${id}`)
    setItems((s) => (s ? s.filter((a) => a.id !== id) : s))
  }

  if (!items) return <div>Loading…</div>

  return (
    <div className="stack">
      <h1>Your history</h1>
      {items.length === 0 && <div className="empty">Nothing recorded yet.</div>}
      {items.map((a) => (
        <div key={a.id} className="row space" style={{ alignItems: 'stretch' }}>
          <div style={{ flex: 1 }}>
            <ActivityCard activity={a} />
          </div>
          <button className="danger small-btn" onClick={() => del(a.id)}>Delete</button>
        </div>
      ))}
    </div>
  )
}
