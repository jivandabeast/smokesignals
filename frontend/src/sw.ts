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
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of clientsArr) {
        if ('focus' in c) return (c as WindowClient).focus()
      }
      if (self.clients.openWindow) await self.clients.openWindow('/')
    })(),
  )
})
