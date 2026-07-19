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

export default function ActivityCard({ activity }: { activity: Activity }) {
  const at = activity.activity_type
  return (
    <article className="card" style={{ borderLeftColor: at.color || '#4aa3df' }}>
      <div className="card-head">
        <div className="avatar">
          {activity.user.profile_picture ? (
            <img src={activity.user.profile_picture} alt={activity.user.nickname} />
          ) : (
            <span>{activity.user.nickname.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="card-title">
          <strong>{activity.user.nickname}</strong>
          <span className="muted"> is {at.label.toLowerCase()} {at.emoji}</span>
        </div>
        <span className="muted small">{timeAgo(activity.created_at)}</span>
      </div>
      {activity.note && <p className="note">{activity.note}</p>}
      {activity.place_label && <p className="place">📍 {activity.place_label}</p>}
    </article>
  )
}
