import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { ReactionSummary } from '../types'

interface ReactionsProps {
  activityId: number
  initial?: ReactionSummary[]
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '🍻']

export default function Reactions({ activityId, initial }: ReactionsProps) {
  const [summaries, setSummaries] = useState<ReactionSummary[]>(initial || [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const pickerRef = useRef<HTMLDivElement | null>(null)

  // Refresh from the parent whenever the feed reloads (`initial` changes).
  useEffect(() => {
    setSummaries(initial || [])
  }, [initial])

  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  const toggle = async (emoji: string) => {
    const clean = emoji.trim()
    if (!clean) return
    try {
      const s = await api.post<ReactionSummary[]>(`/reactions/activity/${activityId}`, {
        emoji: clean,
      })
      setSummaries(s)
    } catch {
      // ignore
    }
  }

  const submitCustom = async () => {
    const value = custom.trim()
    if (!value) return
    setCustom('')
    setPickerOpen(false)
    await toggle(value)
  }

  return (
    <div className="reactions-row">
      {summaries.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={`reaction-chip ${r.mine ? 'mine' : ''}`}
          title={r.users.map((u) => u.nickname).join(', ')}
          onClick={() => toggle(r.emoji)}
        >
          <span>{r.emoji}</span>
          <span className="reaction-count">{r.count}</span>
        </button>
      ))}
      <div className="reaction-picker-wrap" ref={pickerRef}>
        <button
          type="button"
          className="reaction-chip reaction-add"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Add reaction"
        >
          +
        </button>
        {pickerOpen && (
          <div className="reaction-picker" role="dialog">
            {COMMON_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="emoji"
                onClick={() => {
                  setPickerOpen(false)
                  toggle(e)
                }}
              >
                {e}
              </button>
            ))}
            <input
              className="reaction-custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom…"
              maxLength={32}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitCustom()
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
