// Push notifications in the web app: the service worker (web/public/sw.js) shows what the relay sends
// (relay/src/lib/webPush.ts), and a tap opens the app. iPhones only allow it once the app is on the Home Screen
// (iOS 16.4 and later), and every browser only asks after a tap. Settings' Notifications page drives this through
// window.goblin.webPush (installed by web/main.tsx).
import { getRelaySession } from '../src/main/relayState'
import { RELAY_URL, RELAY_DIRECTORY_PATH } from './relayConfig'
import type { WebPushState } from '@shared/ipc'

const SCOPE = '/app/'
const isIos = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const installed = (): boolean => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const zone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone
const keyBytes = (b64url: string): ArrayBuffer => Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4)), (c) => c.charCodeAt(0)).buffer as ArrayBuffer

async function relay<T>(path: string, body?: unknown): Promise<T> {
  const token = getRelaySession()?.token
  const res = await fetch(`${RELAY_URL}${RELAY_DIRECTORY_PATH}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status}).`)
  return data as T
}

export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) void navigator.serviceWorker.register(`${SCOPE}sw.js`, { scope: SCOPE }).catch(() => undefined)
}

async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker?.getRegistration(SCOPE)
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function pushState(): Promise<WebPushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIos() && !installed() ? 'add-to-home' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return (await subscription()) ? 'on' : 'off'
}

/** Asks for permission (call it from a tap), subscribes, and tells the relay where to send, and in which time zone. */
export async function turnPushOn(): Promise<WebPushState> {
  // Asked first, straight from the tap: iPhones refuse the prompt after anything else has been awaited.
  if ((await Notification.requestPermission()) !== 'granted') return pushState()
  const { publicKey } = await relay<{ publicKey: string | null }>('/push-key')
  if (!publicKey) throw new Error('Notifications aren’t set up on the relay yet.')
  const reg = await navigator.serviceWorker.register(`${SCOPE}sw.js`, { scope: SCOPE })
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await relay('/push/subscribe', { subscription: sub.toJSON(), tz: zone() })
  return 'on'
}

/** Stops them here: the relay forgets this browser, and so does the push service. */
export async function turnPushOff(): Promise<WebPushState> {
  const sub = await subscription()
  if (sub) {
    await relay('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined)
    await sub.unsubscribe()
  }
  return pushState()
}

/** Tells the relay this browser's subscription again (its time zone may have changed); quietly, if push is on. */
export async function refreshPush(): Promise<void> {
  const sub = await subscription()
  if (sub) await relay('/push/subscribe', { subscription: sub.toJSON(), tz: zone() }).catch(() => undefined)
}
