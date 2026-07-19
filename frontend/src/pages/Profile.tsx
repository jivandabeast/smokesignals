import { ChangeEvent, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import type { UserOut } from '../types'

export default function Profile() {
  const { user, refresh } = useAuth()
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [locOptIn, setLocOptIn] = useState(user?.location_opt_in || false)
  const [contacts, setContacts] = useState<Record<string, string>>(user?.contact_platforms || {})
  const [msg, setMsg] = useState<string | null>(null)

  if (!user) return null

  const save = async () => {
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

  const setContact = (k: string, v: string) => setContacts({ ...contacts, [k]: v })

  return (
    <div className="stack">
      <h1>Profile</h1>
      <div className="row">
        <div className="avatar large">
          {user.profile_picture ? <img src={user.profile_picture} alt={user.nickname} /> : <span>{user.nickname.slice(0, 1).toUpperCase()}</span>}
        </div>
        <label className="secondary as-button">
          Change photo
          <input type="file" accept="image/*" onChange={uploadAvatar} hidden />
        </label>
      </div>

      <label>
        <span>Nickname</span>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>

      <label className="row">
        <input
          type="checkbox"
          checked={locOptIn}
          onChange={async (e) => {
            const next = e.target.checked
            setLocOptIn(next)
            if (next && 'geolocation' in navigator) {
              try {
                await new Promise<GeolocationPosition>((resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10_000,
                  })
                })
                setMsg('Location permission granted — remember to Save.')
              } catch (err: any) {
                setMsg(
                  err?.code === 1
                    ? 'You denied the location permission. Enable it in your browser settings, then re-toggle.'
                    : 'Could not obtain your location. You can still opt in.',
                )
              }
            }
          }}
        />
        <span>Attach location to signals (opt-in)</span>
      </label>

      <fieldset className="stack">
        <legend>How friends can reach you</legend>
        <label>
          <span>Phone</span>
          <input value={contacts.phone || ''} onChange={(e) => setContact('phone', e.target.value)} placeholder="+1 555 123 4567" />
        </label>
        <label>
          <span>Signal</span>
          <input value={contacts.signal || ''} onChange={(e) => setContact('signal', e.target.value)} />
        </label>
        <label>
          <span>Telegram</span>
          <input value={contacts.telegram || ''} onChange={(e) => setContact('telegram', e.target.value)} />
        </label>
        <label>
          <span>WhatsApp</span>
          <input value={contacts.whatsapp || ''} onChange={(e) => setContact('whatsapp', e.target.value)} />
        </label>
      </fieldset>

      {msg && <div className="hint">{msg}</div>}
      <button className="primary" onClick={save}>Save</button>
    </div>
  )
}
