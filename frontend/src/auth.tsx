import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { api, getToken, setToken } from './api'
import type { PublicConfig, UserOut } from './types'

interface AuthContextValue {
  user: UserOut | null
  loading: boolean
  config: PublicConfig | null
  needsBootstrap: boolean
  refresh: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  register: (email: string, username: string, nickname: string, password: string) => Promise<void>
  registerAdmin: (email: string, username: string, nickname: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [needsBootstrap, setNeedsBootstrap] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [cfg, bs] = await Promise.all([
        api.get<PublicConfig>('/config'),
        api.get<{ needs_bootstrap: boolean }>('/auth/bootstrap-status'),
      ])
      setConfig(cfg)
      setNeedsBootstrap(bs.needs_bootstrap)

      if (!getToken() && cfg.cloudflare_access_enabled) {
        try {
          const t = await fetch('/api/auth/cf-session', {
            method: 'POST',
            credentials: 'include',
          })
          if (t.ok) {
            const data = (await t.json()) as { access_token: string }
            if (data.access_token) setToken(data.access_token)
          } else {
            let detail = ''
            try {
              const body = await t.json()
              detail = body?.detail ? JSON.stringify(body.detail) : ''
            } catch {
              // ignore
            }
            console.warn(`[cf-session] ${t.status} ${t.statusText}${detail ? ' — ' + detail : ''}`)
          }
        } catch (err) {
          console.warn('[cf-session] network error', err)
        }
      }

      if (getToken()) {
        try {
          const me = await api.get<UserOut>('/auth/me')
          setUser(me)
        } catch {
          setToken(null)
          setUser(null)
        }
      } else {
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = async (username: string, password: string) => {
    const t = await api.post<{ access_token: string }>('/auth/login', { username, password })
    setToken(t.access_token)
    await refresh()
  }

  const register = async (email: string, username: string, nickname: string, password: string) => {
    const t = await api.post<{ access_token: string }>('/auth/register', { email, username, nickname, password })
    setToken(t.access_token)
    await refresh()
  }

  const registerAdmin = async (email: string, username: string, nickname: string, password: string) => {
    const t = await api.post<{ access_token: string }>('/auth/register-admin', { email, username, nickname, password })
    setToken(t.access_token)
    await refresh()
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, config, needsBootstrap, refresh, login, register, registerAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside provider')
  return ctx
}
