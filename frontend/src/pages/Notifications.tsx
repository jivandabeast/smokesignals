import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api'
import type { AppNotification } from '../types'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function iconFor(kind: string): string {
  switch (kind) {
    case 'friend_request':
      return '👋'
    case 'friend_accepted':
      return '🤝'
    case 'activity':
      return '🔥'
    case 'reaction':
      return '💬'
    default:
      return '🔔'
  }
}

export default function Notifications() {
  const nav = useNavigate()
  const [items, setItems] = useState<AppNotification[]>([])

  const load = async () => setItems(await api.get<AppNotification[]>('/notifications'))

  useEffect(() => {
    load()
    const id = setInterval(load, 20000)
    const onVis = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string } | null
      if (d && d.type === 'notify-update') load()
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  // Auto-mark visible notifications as read shortly after they're rendered.
  // The user has clearly "seen" them once the page has been open for a beat.
  useEffect(() => {
    if (items.length === 0) return
    if (!items.some((n) => !n.read)) return
    const t = setTimeout(async () => {
      try {
        await api.post('/notifications/read-all')
        setItems((s) => s.map((n) => ({ ...n, read: true })))
      } catch {
        // ignore
      }
    }, 800)
    return () => clearTimeout(t)
  }, [items])

  const open = async (n: AppNotification) => {
    try {
      const res = await api.post<{ path: string }>(`/notifications/${n.id}/open`)
      setItems((s) => s.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      if (res?.path) nav(res.path)
    } catch {
      // fall back to root
      nav('/')
    }
  }

  const markAll = async () => {
    await api.post('/notifications/read-all')
    await load()
  }

  return (
    <div className="stack">
      <div className="row space">
        <h1>Notifications</h1>
        {items.some((n) => !n.read) && (
          <button className="secondary small-btn" onClick={markAll}>
            Mark all read
          </button>
        )}
      </div>
      {items.length === 0 && <div className="empty">You're all caught up.</div>}
      <ul className="notif-list">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={`notif-card ${n.read ? '' : 'unread'}`}
              onClick={() => open(n)}
            >
              <span className="notif-icon" aria-hidden>{iconFor(n.kind)}</span>
              <span className="notif-body">
                <span className="notif-title">{n.title}</span>
                {n.body && <span className="notif-sub">{n.body}</span>}
                <span className="muted small">{timeAgo(n.created_at)}</span>
              </span>
              {!n.read && <span className="notif-dot" aria-label="unread" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
