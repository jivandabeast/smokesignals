import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Activity } from '../types'
import ActivityCard from '../components/ActivityCard'

export default function Feed() {
  const [items, setItems] = useState<Activity[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    try {
      setItems(await api.get<Activity[]>('/activities/feed'))
    } catch (e: any) {
      setErr(e.message)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  if (err) return <div className="error">{err}</div>
  if (!items) return <div>Loading feed…</div>

  return (
    <div className="stack">
      <h1>Recent</h1>
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
