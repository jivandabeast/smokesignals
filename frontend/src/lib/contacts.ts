import type { UserPublic } from '../types'

/**
 * Normalise a phone-like string for `tel:` / `facetime:` / WhatsApp URIs.
 * Keeps the leading `+` when present; strips everything else that isn't a digit.
 */
function normalisePhone(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const plus = trimmed.startsWith('+') ? '+' : ''
  return plus + trimmed.replace(/[^\d]/g, '')
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function buildFaceTimeHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (isEmail(value)) return `facetime:${encodeURIComponent(value)}`
  const phone = normalisePhone(value)
  return phone ? `facetime:${encodeURIComponent(phone)}` : null
}

function buildWhatsAppHref(raw: string): string | null {
  const digits = normalisePhone(raw).replace(/^\+/, '')
  if (!digits) return null
  return `https://wa.me/${digits}`
}

function buildTelHref(raw: string): string | null {
  const phone = normalisePhone(raw)
  return phone ? `tel:${phone}` : null
}

function buildSignalHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  // Signal supports sgnl:// links; users can enter either a phone number or a
  // username. If it looks like a phone, format it for the URI; otherwise pass
  // through verbatim.
  const looksLikePhone = /^\+?[\d\s\-()]+$/.test(value)
  const target = looksLikePhone ? normalisePhone(value) : value
  return `sgnl://signal.me/#p/${encodeURIComponent(target)}`
}

export interface ContactAction {
  href: string
  label: string
  emoji: string
  title: string
  external: boolean
}

/** Build the list of contact actions available for a given user. */
export function contactActionsFor(user: UserPublic): ContactAction[] {
  const cp = user.contact_platforms || {}
  const phone = cp.phone
  const facetime = cp.facetime
  const whatsapp = cp.whatsapp || cp.phone
  const signal = cp.signal || cp.phone

  const actions: ContactAction[] = []

  const phoneHref = phone ? buildTelHref(phone) : null
  if (phoneHref) {
    actions.push({ href: phoneHref, label: 'Call', emoji: '📞', title: `Call ${phone}`, external: false })
  }

  const ftHref = facetime ? buildFaceTimeHref(facetime) : null
  if (ftHref) {
    actions.push({ href: ftHref, label: 'FaceTime', emoji: '📹', title: `FaceTime ${facetime}`, external: false })
  }

  const waHref = whatsapp ? buildWhatsAppHref(whatsapp) : null
  if (waHref) {
    actions.push({ href: waHref, label: 'WhatsApp', emoji: '🟢', title: `WhatsApp ${whatsapp}`, external: true })
  }

  const sgHref = signal ? buildSignalHref(signal) : null
  if (sgHref) {
    actions.push({ href: sgHref, label: 'Signal', emoji: '🔒', title: `Signal ${signal}`, external: false })
  }

  return actions
}
