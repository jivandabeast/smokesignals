import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { UserPublic } from '../types'
import { contactActionsFor } from '../lib/contacts'

interface FriendActionsMenuProps {
  user: UserPublic
  onRemove: () => void
}

/**
 * Kebab (⋯) button that opens a popover containing:
 *   - View profile
 *   - Call / FaceTime / WhatsApp / Signal (whichever the user configured)
 *   - Remove friend
 *
 * Used inside dense friend rows where showing every contact button inline
 * caused wrapping and layout issues.
 */
export default function FriendActionsMenu({ user, onRemove }: FriendActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const contacts = contactActionsFor(user)

  const stop = (e: React.MouseEvent | React.TouchEvent) => e.stopPropagation()

  return (
    <div className="kebab-wrap" ref={wrapRef} onClick={stop} onTouchStart={stop}>
      <button
        type="button"
        className="kebab-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${user.nickname}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ⋯
      </button>
      {open && (
        <div className="kebab-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="kebab-item"
            onClick={() => {
              setOpen(false)
              nav(`/u/${user.id}`)
            }}
          >
            <span className="kebab-emoji" aria-hidden="true">👤</span>
            <span>View profile</span>
          </button>
          {contacts.map((c) => (
            <a
              key={c.label}
              role="menuitem"
              className="kebab-item"
              href={c.href}
              title={c.title}
              target={c.external ? '_blank' : undefined}
              rel={c.external ? 'noopener noreferrer' : undefined}
              onClick={() => setOpen(false)}
            >
              <span className="kebab-emoji" aria-hidden="true">{c.emoji}</span>
              <span>{c.label}</span>
            </a>
          ))}
          <button
            type="button"
            role="menuitem"
            className="kebab-item danger"
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
          >
            <span className="kebab-emoji" aria-hidden="true">🗑</span>
            <span>Remove friend</span>
          </button>
        </div>
      )}
    </div>
  )
}
