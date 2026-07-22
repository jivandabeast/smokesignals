import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import Avatar from '../components/Avatar'
import ActivityCard from '../components/ActivityCard'
import ContactButtons from '../components/ContactButtons'
import { useAuth } from '../auth'
import type { Activity, UserPublic } from '../types'

/**
 * True if there's a most-recent activity within its duration window (fallback
 * to a 2-hour freshness window when duration is unset).
 */
function hasActiveSignal(activities: Activity[]): boolean {
  if (activities.length === 0) return false
  const head = activities[0]
  const created = new Date(head.created_at).getTime()
  const windowMs = (head.duration_minutes || 120) * 60 * 1000
  return Date.now() - created < windowMs
}

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>()
  const { user: me } = useAuth()
  const [user, setUser] = useState<UserPublic | null>(null)
  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const load = async () => {
      try {
        const [u, a] = await Promise.all([
          api.get<UserPublic>(`/users/${userId}`),
          api.get<Activity[]>(`/activities/user/${userId}`),
        ])
        if (!cancelled) {
          setUser(u)
          setActivities(a)
        }
      } catch (e: any) {
        if (!cancelled) setErr(e.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (err) return <div className="error">{err}</div>
  if (!user || !activities) return <div>Loading…</div>

  const showContacts = me && me.id !== user.id && hasActiveSignal(activities)

  return (
    <div className="stack">
      <section className="stack profile-header">
        <div className="row" style={{ gap: 16 }}>
          <Avatar user={user} size="large" />
          <div>
            <h1 style={{ margin: 0 }}>{user.nickname}</h1>
            <div className="muted">@{user.username}</div>
          </div>
        </div>
        {showContacts && <ContactButtons user={user} />}
      </section>

      <section className="stack">
        <h2>Recent activity</h2>
        {activities.length === 0 && <div className="empty">No activity yet.</div>}
        {activities.map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
      </section>
    </div>
  )
}
