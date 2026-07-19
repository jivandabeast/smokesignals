import { api } from './api'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const s = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(s)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i)
  return output
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function currentPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

async function registerSubscription(vapidPublicKey: string) {
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
    })
  }
  const json = sub.toJSON()
  await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys })
}

/**
 * Silent path: if permission is already granted, make sure the server has our
 * current subscription. Does NOT prompt the user. Safe to call on every mount.
 */
export async function ensurePushSubscription(vapidPublicKey: string) {
  if (!isPushSupported()) return
  if (Notification.permission !== 'granted') return
  try {
    await registerSubscription(vapidPublicKey)
  } catch {
    // ignore — server can retry later
  }
}

/**
 * Loud path: triggered by an explicit user action (e.g. tapping "Enable").
 * Requests permission, then subscribes. Returns the final permission state.
 */
export async function requestPushPermission(
  vapidPublicKey: string,
): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm === 'granted') {
    try {
      await registerSubscription(vapidPublicKey)
    } catch {
      // ignore
    }
  }
  return perm
}
