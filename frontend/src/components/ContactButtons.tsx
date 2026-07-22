import type { UserPublic } from '../types'
import { contactActionsFor } from '../lib/contacts'

interface ContactButtonsProps {
  user: UserPublic
  /** Compact variant uses smaller buttons — used inside dense friend rows. */
  compact?: boolean
}

export default function ContactButtons({ user, compact }: ContactButtonsProps) {
  const buttons = contactActionsFor(user)
  if (buttons.length === 0) return null

  return (
    <div className={`contact-row ${compact ? 'compact' : ''}`}>
      {buttons.map((b) => (
        <a
          key={b.label}
          href={b.href}
          className="contact-btn"
          title={b.title}
          target={b.external ? '_blank' : undefined}
          rel={b.external ? 'noopener noreferrer' : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="contact-emoji" aria-hidden="true">
            {b.emoji}
          </span>
          <span className="contact-label">{b.label}</span>
        </a>
      ))}
    </div>
  )
}
