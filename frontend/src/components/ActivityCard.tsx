import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import ContactButtons from './ContactButtons'
import Reactions from './Reactions'
import { useAuth } from '../auth'
import type { Activity } from '../types'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function fmtDuration(min: number | null | undefined): string | null {
  if (!min) return null
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

/**
 * A signal is considered "active" if it's within its explicit duration window,
 * or within a two-hour freshness fallback when the poster didn't set one.
 */
function isActive(activity: Activity): boolean {
  const created = new Date(activity.created_at).getTime()
  const windowMs = (activity.duration_minutes || 120) * 60 * 1000
  return Date.now() - created < windowMs
}

interface ActivityCardProps {
  activity: Activity
  /** When provided, rendered on the same line as the label (e.g., "×3"). */
  combo?: number | null
}

export default function ActivityCard({ activity, combo }: ActivityCardProps) {
  const { user: me } = useAuth()
  const at = activity.activity_type
  const dur = fmtDuration(activity.duration_minutes)
  const active = isActive(activity)
  const showContacts = active && me && me.id !== activity.user.id
  return (
    <article
      id={`activity-${activity.id}`}
      className={`card activity-card ${active ? 'is-active' : ''}`}
      style={{ borderLeftColor: at.color || '#4aa3df' }}
    >
      <div className="card-head">
        <Link to={`/u/${activity.user.id}`} className="avatar-link">
          <Avatar user={activity.user} />
        </Link>
        <div className="card-title">
          <strong>{activity.user.nickname}:</strong>
          <span className="muted">
            {' '}{at.label} {at.emoji}
            {combo && combo > 1 ? <span className="combo"> ×{combo}</span> : null}
          </span>
        </div>
        <span className="muted small">{timeAgo(activity.created_at)}</span>
      </div>
      {activity.note && <p className="note">{activity.note}</p>}
      <div className="card-meta muted small">
        {activity.place_label && <span>📍 {activity.place_label}</span>}
        {dur && <span>⏱ {dur}</span>}
      </div>
      {showContacts && <ContactButtons user={activity.user} />}
      <Reactions activityId={activity.id} initial={activity.reactions} />
    </article>
  )
}
