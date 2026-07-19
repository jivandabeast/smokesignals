import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'

export default function Login() {
  const { login, config } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await login(username, password)
    } catch (e: any) {
      setErr(e.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">🔥 SmokeSignals</div>
        <p className="auth-lede">Share the moment. Call your circle.</p>
        <form onSubmit={submit} className="stack">
          <label>
            <span>Username or email</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {err && <div className="error">{err}</div>}
          <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <Link to="/register" className="ghost-link">Create an account</Link>
          {config?.cloudflare_access_enabled && (
            <p className="hint">Cloudflare Access is enabled — you may already be signed in through your identity provider.</p>
          )}
        </form>
      </div>
    </div>
  )
}
