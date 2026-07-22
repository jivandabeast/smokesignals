import { ChangeEvent, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import Avatar from '../components/Avatar'
import type { UserOut } from '../types'

async function requestLocationOnce(): Promise<GeolocationPosition> {
  if (!('geolocation' in navigator)) {
    throw new Error('Geolocation not supported on this device.')
  }
  return await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
    })
  })
}

export default function Profile() {
  const { user, refresh } = useAuth()
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [locOptIn, setLocOptIn] = useState(user?.location_opt_in || false)
  const [contacts, setContacts] = useState<Record<string, string>>(user?.contact_platforms || {})
  const [msg, setMsg] = useState<string | null>(null)
  const [locBusy, setLocBusy] = useState(false)

  if (!user) return null

  const save = async () => {
    // If they've saved with location opt-in on, make one more attempt to grab
    // the permission on this device. Permission is per-device, so a fresh
    // browser on a new phone still needs the prompt even if the account flag
    // is already true.
    if (locOptIn) {
      try {
        await requestLocationOnce()
      } catch {
        // Non-fatal — the user might have denied it or be offline.
      }
    }
    await api.patch<UserOut>('/users/me', {
      nickname,
      location_opt_in: locOptIn,
      contact_platforms: contacts,
    })
    await refresh()
    setMsg('Saved')
  }

  const uploadAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    await api.upload<UserOut>('/users/me/avatar', form)
    await refresh()
  }

  const setContact = (k: string, v: string) => {
    // Empty strings shouldn't be persisted as contacts.
    const next = { ...contacts }
    if (v.trim()) next[k] = v
    else delete next[k]
    setContacts(next)
  }

  const promptLocation = async () => {
    setLocBusy(true)
    setMsg(null)
    try {
      await requestLocationOnce()
      setMsg('Location permission granted on this device.')
    } catch (err: any) {
      if (err && err.code === 1) {
        setMsg(
          'Location permission was denied on this device. On iPhone, enable it in Settings → Safari → Location.',
        )
      } else {
        setMsg('Could not obtain your location on this device.')
      }
    } finally {
      setLocBusy(false)
    }
  }

  const onToggleLocOptIn = async (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    setLocOptIn(next)
    setMsg(null)
    if (!next) return
    // Fire a permission prompt inside the click's user-gesture window so iOS
    // Safari actually shows it. If we defer to Save, iOS suppresses the prompt.
    setLocBusy(true)
    try {
      await requestLocationOnce()
      setMsg('Location permission granted on this device — remember to Save.')
    } catch (err: any) {
      if (err && err.code === 1) {
        setMsg(
          'You denied the location permission on this device. On iPhone, allow it via Settings → Safari → Location, then tap "Re-prompt location".',
        )
      } else {
        setMsg('Could not obtain your location on this device. You can still opt in and try later.')
      }
    } finally {
      setLocBusy(false)
    }
  }

  return (
    <div className="stack">
      <h1>Profile</h1>
      <div className="row">
        <Avatar user={user} size="large" />
        <label className="secondary as-button">
          Change photo
          <input type="file" accept="image/*" onChange={uploadAvatar} hidden />
        </label>
      </div>

      <label>
        <span>Nickname</span>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>

      <div className="stack">
        <label className="row">
          <input
            type="checkbox"
            checked={locOptIn}
            onChange={onToggleLocOptIn}
          />
          <span>Attach location to signals (opt-in)</span>
        </label>
        {locOptIn && (
          <div className="row">
            <button
              type="button"
              className="secondary small-btn"
              disabled={locBusy}
              onClick={promptLocation}
            >
              {locBusy ? 'Requesting…' : 'Re-prompt location on this device'}
            </button>
          </div>
        )}
      </div>

      <fieldset className="stack">
        <legend>How friends can reach you</legend>
        <label>
          <span>Phone</span>
          <input
            value={contacts.phone || ''}
            onChange={(e) => setContact('phone', e.target.value)}
            placeholder="+1 555 123 4567"
            inputMode="tel"
          />
        </label>
        <label>
          <span>FaceTime (phone or email)</span>
          <input
            value={contacts.facetime || ''}
            onChange={(e) => setContact('facetime', e.target.value)}
            placeholder="+1 555 123 4567 or you@example.com"
          />
        </label>
        <label>
          <span>Signal</span>
          <input
            value={contacts.signal || ''}
            onChange={(e) => setContact('signal', e.target.value)}
          />
        </label>
        <label>
          <span>WhatsApp</span>
          <input
            value={contacts.whatsapp || ''}
            onChange={(e) => setContact('whatsapp', e.target.value)}
          />
        </label>
      </fieldset>

      {msg && <div className="hint">{msg}</div>}
      <button className="primary" onClick={save}>Save</button>
    </div>
  )
}
