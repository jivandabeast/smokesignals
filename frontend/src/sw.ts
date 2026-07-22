/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST || [])

self.addEventListener('push', (event: PushEvent) => {
  let payload: { title?: string; body?: string; data?: Record<string, unknown> } = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'SmokeSignals', body: event.data?.text() || '' }
  }
  const title = payload.title || 'SmokeSignals'
  const options: NotificationOptions = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || {},
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options)
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of clientsArr) {
        try {
          ;(c as WindowClient).postMessage({ type: 'notify-update' })
        } catch {
          // ignore
        }
      }
    })(),
  )
})

function pathForData(data: Record<string, unknown>): string {
  const kind = String(data.kind || '')
  if (kind === 'friend_request' || kind === 'friend_accepted') return '/friends'
  if (kind === 'activity' && data.activity_id) return `/#activity-${data.activity_id}`
  return '/'
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const data = (event.notification.data || {}) as Record<string, unknown>
  const targetPath = pathForData(data)
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of clientsArr) {
        if ('focus' in c) {
          try {
            ;(c as WindowClient).postMessage({ type: 'navigate', path: targetPath })
          } catch {
            // ignore
          }
          return (c as WindowClient).focus()
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetPath)
    })(),
  )
})
