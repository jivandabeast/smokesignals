import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Avatar from '../components/Avatar'
import FriendActionsMenu from '../components/FriendActionsMenu'
import type { FriendRequest, FriendStatus, UserPublic } from '../types'

function fmtRemaining(sec: number | null | undefined): string | null {
  if (sec == null) return null
  if (sec <= 0) return null
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m left`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m left` : `${h}h left`
}

export default function Friends() {
  const [statuses, setStatuses] = useState<FriendStatus[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserPublic[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    setStatuses(await api.get<FriendStatus[]>('/activities/friends-status'))
    setRequests(await api.get<FriendRequest[]>('/friends/requests'))
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return
    }
    const id = setTimeout(async () => {
      const r = await api.get<UserPublic[]>(`/users/search?q=${encodeURIComponent(q)}`)
      setResults(r)
    }, 250)
    return () => clearTimeout(id)
  }, [q])

  const sendRequest = async (id: number) => {
    try {
      await api.post(`/friends/request/${id}`)
      setMsg('Request sent')
      setResults((r) => r.filter((u) => u.id !== id))
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  const respond = async (id: number, accept: boolean) => {
    await api.post(`/friends/respond/${id}?accept=${accept}`)
    await load()
  }

  const removeFriend = async (id: number) => {
    if (!confirm('Remove this friend?')) return
    await api.del(`/friends/${id}`)
    await load()
  }

  return (
    <div className="stack">
      <h1>Friends</h1>

      <label>
        <span>Find people</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="username or nickname" />
      </label>
      {msg && <div className="hint">{msg}</div>}
      {results.length > 0 && (
        <ul className="user-list">
          {results.map((u) => (
            <li key={u.id}>
              <Link to={`/u/${u.id}`} className="user-row user-row-link">
                <Avatar user={u} size="small" />
                <div>
                  <div><strong>{u.nickname}</strong></div>
                  <div className="muted small">@{u.username}</div>
                </div>
              </Link>
              <button className="secondary small-btn" onClick={() => sendRequest(u.id)}>Add</button>
            </li>
          ))}
        </ul>
      )}

      {requests.length > 0 && (
        <section className="stack">
          <h2>Requests</h2>
          <ul className="user-list">
            {requests.map((r) => (
              <li key={r.id} id={`request-${r.id}`}>
                <Link to={`/u/${r.requester.id}`} className="user-row user-row-link">
                  <Avatar user={r.requester} size="small" />
                  <div>
                    <div><strong>{r.requester.nickname}</strong></div>
                    <div className="muted small">@{r.requester.username}</div>
                  </div>
                </Link>
                <div className="row">
                  <button className="primary small-btn" onClick={() => respond(r.id, true)}>Accept</button>
                  <button className="danger small-btn" onClick={() => respond(r.id, false)}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack">
        <h2>Your circle</h2>
        {statuses.length === 0 && <div className="empty">No friends yet.</div>}
        <ul className="friend-status-list">
          {statuses.map((s) => {
            const a = s.last_activity
            const remaining = fmtRemaining(s.expires_in_seconds)
            return (
              <li
                key={s.user.id}
                id={`user-${s.user.id}`}
                className={`friend-status ${s.is_active_now ? 'active' : ''}`}
                style={a?.activity_type?.color ? { borderLeftColor: a.activity_type.color } : undefined}
              >
                <Link to={`/u/${s.user.id}`} className="friend-status-link">
                  <Avatar user={s.user} />
                  <div className="fs-body">
                    <div className="fs-row">
                      <strong>{s.user.nickname}</strong>
                      {s.is_active_now && <span className="fs-dot" aria-label="active" />}
                    </div>
                    {a ? (
                      <div className="muted small fs-status">
                        <span>{a.activity_type.emoji || '•'} {a.activity_type.label}</span>
                        {s.combo && s.combo > 1 && <span className="combo">×{s.combo}</span>}
                        {a.place_label && <span>· 📍 {a.place_label}</span>}
                        {remaining && s.is_active_now && <span>· {remaining}</span>}
                        {!s.is_active_now && <span>· quiet</span>}
                      </div>
                    ) : (
                      <div className="muted small">Hasn't signalled yet.</div>
                    )}
                  </div>
                </Link>
                <FriendActionsMenu user={s.user} onRemove={() => removeFriend(s.user.id)} />
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
