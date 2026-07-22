import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { api } from '../api'
import Avatar from './Avatar'
import type { AppNotification } from '../types'
import {
  currentPermission,
  ensurePushSubscription,
  isPushSupported,
  requestPushPermission,
} from '../push'

const DISMISS_KEY = 'smokesignals.pushBannerDismissedAt'
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7 // one week

export default function Layout() {
  const { user, logout, config } = useAuth()
  const nav = useNavigate()
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    currentPermission(),
  )
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    const ts = Number(window.localStorage.getItem(DISMISS_KEY) || 0)
    return ts > 0 && Date.now() - ts < DISMISS_TTL_MS
  })
  const [enabling, setEnabling] = useState(false)

  useEffect(() => {
    let stop = false
    const loop = async () => {
      try {
        const items = await api.get<AppNotification[]>('/notifications?limit=50')
        if (!stop) setUnread(items.filter((n) => !n.read).length)
      } catch {
        // ignore
      }
    }
    loop()
    const id = setInterval(loop, 20000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (config?.vapid_public_key) {
      ensurePushSubscription(config.vapid_public_key).catch(() => {})
    }
  }, [config])

  useEffect(() => {
    // The service worker posts {type:'navigate', path} when a push
    // notification is clicked while the app is already open.
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; path?: string } | null
      if (d && d.type === 'navigate' && d.path) nav(d.path)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [nav])

  const enablePush = async () => {
    if (!config?.vapid_public_key) return
    setEnabling(true)
    try {
      const next = await requestPushPermission(config.vapid_public_key)
      setPermission(next)
      if (next !== 'granted') {
        // User denied — remember the dismissal so we don't nag them.
        window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
        setBannerDismissed(true)
      }
    } finally {
      setEnabling(false)
    }
  }

  const dismissBanner = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setBannerDismissed(true)
  }

  const showPushBanner =
    !!config?.vapid_public_key &&
    isPushSupported() &&
    permission === 'default' &&
    !bannerDismissed

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => nav('/')}>
          <span className="brand-icon">🔥</span>
          <span>SmokeSignals</span>
        </button>
        <div className="header-actions">
          <NavLink to="/notifications" className="icon-btn" aria-label="Notifications">
            🔔{unread > 0 && <span className="badge">{unread}</span>}
          </NavLink>
          <NavLink to="/profile" className="icon-btn" aria-label="Profile">
            {user ? (
              <Avatar user={user} size="small" />
            ) : (
              <span>👤</span>
            )}
          </NavLink>
          <button
            className="icon-btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ☰
          </button>
        </div>
      </header>

      {menuOpen && (
        <>
          <div className="drawer-scrim" onClick={closeMenu} />
          <aside className="drawer" role="dialog" aria-label="More">
            <div className="drawer-header">
              <strong>{user?.nickname}</strong>
              <span className="muted small">@{user?.username}</span>
            </div>
            <NavLink to="/profile" className="drawer-link" onClick={closeMenu}>👤 Profile</NavLink>
            <NavLink to="/circles" className="drawer-link" onClick={closeMenu}>🫂 Circles</NavLink>
            <NavLink to="/map" className="drawer-link" onClick={closeMenu}>🗺️ Map</NavLink>
            <NavLink to="/notifications" className="drawer-link" onClick={closeMenu}>🔔 Notifications</NavLink>
            {user?.is_admin && (
              <NavLink to="/admin" className="drawer-link drawer-admin" onClick={closeMenu}>👑 Admin panel</NavLink>
            )}
            <button
              className="drawer-link danger"
              onClick={() => {
                closeMenu()
                logout()
              }}
            >
              🚪 Log out
            </button>
          </aside>
        </>
      )}

      <main className="app-main">
        {showPushBanner && (
          <div className="push-banner" role="region" aria-label="Enable notifications">
            <div className="push-banner-text">
              <strong>🔔 Get pinged when friends signal</strong>
              <span className="muted small">
                Allow notifications so you never miss a chance to meet up.
              </span>
            </div>
            <div className="push-banner-actions">
              <button className="secondary" onClick={dismissBanner} disabled={enabling}>
                Not now
              </button>
              <button className="primary" onClick={enablePush} disabled={enabling}>
                {enabling ? 'Enabling…' : 'Enable'}
              </button>
            </div>
          </div>
        )}
        <Outlet />
      </main>

      <nav className="tab-bar">
        <NavLink to="/" end className="tab">
          <span>🏠</span>
          <span>Feed</span>
        </NavLink>
        <NavLink to="/friends" className="tab">
          <span>👥</span>
          <span>Friends</span>
        </NavLink>
        <NavLink to="/post" className="tab tab-primary">
          <span className="fab">+</span>
        </NavLink>
        <NavLink to="/history" className="tab">
          <span>📖</span>
          <span>History</span>
        </NavLink>
        <NavLink to="/stats" className="tab">
          <span>📊</span>
          <span>Stats</span>
        </NavLink>
      </nav>
    </div>
  )
}
