import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Activity } from '../types'
import ActivityCard from '../components/ActivityCard'

export default function Feed() {
  const [items, setItems] = useState<Activity[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const mountedRef = useRef(false)

  const load = async () => {
    if (mountedRef.current) setRefreshing(true)
    try {
      const data = await api.get<Activity[]>('/activities/feed')
      setItems(data)
      setErr(null)
      // Viewing the feed clears the unread badge for friend-activity notifs.
      api.post('/notifications/read-kind/activity').catch(() => {})
    } catch (e: any) {
      setErr(e.message)
    } finally {
      if (mountedRef.current) setRefreshing(false)
      mountedRef.current = true
    }
  }

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

  if (err) return <div className="error">{err}</div>
  if (!items) return <div>Loading feed…</div>

  return (
    <div className="stack">
      <h1>
        Recent
        {refreshing && <span className="refresh-dot" aria-label="refreshing" />}
      </h1>
      {items.length === 0 && (
        <div className="empty">
          Nothing here yet — hit <b>+</b> to signal your friends.
        </div>
      )}
      {items.map((a) => (
        <ActivityCard key={a.id} activity={a} />
      ))}
    </div>
  )
}
