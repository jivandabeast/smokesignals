import { FormEvent, useState } from 'react'
import { useAuth } from '../auth'

export default function BootstrapAdmin() {
  const { registerAdmin } = useAuth()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await registerAdmin(email, username, nickname, password)
    } catch (e: any) {
      setErr(e.message || 'Bootstrap failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">🔥 SmokeSignals</div>
        <p className="auth-lede">Welcome! Create the admin account to get started.</p>
        <form onSubmit={submit} className="stack">
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            <span>Nickname</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </label>
          {err && <div className="error">{err}</div>}
          <button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create admin'}</button>
        </form>
      </div>
    </div>
  )
}
