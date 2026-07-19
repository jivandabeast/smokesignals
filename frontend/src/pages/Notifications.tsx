import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AppNotification } from '../types'

export default function Notifications() {
  const [items, setItems] = useState<AppNotification[]>([])

  const load = async () => setItems(await api.get<AppNotification[]>('/notifications'))
  useEffect(() => {
    load()
  }, [])

  const markAll = async () => {
    await api.post('/notifications/read-all')
    await load()
  }

  return (
    <div className="stack">
      <div className="row space">
        <h1>Notifications</h1>
        <button className="secondary" onClick={markAll}>Mark all read</button>
      </div>
      {items.length === 0 && <div className="empty">No notifications.</div>}
      {items.map((n) => (
        <div key={n.id} className={`card ${n.read ? '' : 'unread'}`}>
          <div><strong>{n.title}</strong></div>
          {n.body && <div>{n.body}</div>}
          <div className="muted small">{new Date(n.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  )
}
