import { useEffect, useState } from 'react'
import { api } from '../api'
import type { FriendRequest, UserPublic } from '../types'

export default function Friends() {
  const [friends, setFriends] = useState<UserPublic[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserPublic[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    setFriends(await api.get<UserPublic[]>('/friends'))
    setRequests(await api.get<FriendRequest[]>('/friends/requests'))
  }

  useEffect(() => {
    load()
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
              <UserRow user={u} />
              <button className="secondary" onClick={() => sendRequest(u.id)}>Add</button>
            </li>
          ))}
        </ul>
      )}

      {requests.length > 0 && (
        <section className="stack">
          <h2>Requests</h2>
          <ul className="user-list">
            {requests.map((r) => (
              <li key={r.id}>
                <UserRow user={r.requester} />
                <div className="row">
                  <button className="primary" onClick={() => respond(r.id, true)}>Accept</button>
                  <button className="danger" onClick={() => respond(r.id, false)}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack">
        <h2>Your circle</h2>
        {friends.length === 0 && <div className="empty">No friends yet.</div>}
        <ul className="user-list">
          {friends.map((f) => (
            <li key={f.id}>
              <UserRow user={f} />
              <button className="danger" onClick={() => removeFriend(f.id)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function UserRow({ user }: { user: UserPublic }) {
  return (
    <div className="user-row">
      <div className="avatar small">
        {user.profile_picture ? (
          <img src={user.profile_picture} alt={user.nickname} />
        ) : (
          <span>{user.nickname.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div>
        <div><strong>{user.nickname}</strong></div>
        <div className="muted small">@{user.username}</div>
      </div>
    </div>
  )
}
