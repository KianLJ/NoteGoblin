import { pushKey, subscribePush, unsubscribePush } from './api'

/**
 * Push notifications on this phone (or browser): the service worker (public/sw.js) shows what the relay sends.
 * iPhones only allow it once the viewer is on the Home Screen (iOS 16.4 and later), and every browser only asks
 * after a tap.
 */
export type PushState = 'on' | 'off' | 'blocked' | 'add-to-home' | 'unsupported'

const isIos = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const installed = (): boolean => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/viewer/sw.js', { scope: '/viewer/' }).catch(() => undefined)
}

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIos() && !installed() ? 'add-to-home' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration('/viewer/')
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'
}

const keyBytes = (b64url: string): ArrayBuffer => Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4)), (c) => c.charCodeAt(0)).buffer as ArrayBuffer

/** Asks for permission (call it from a tap), subscribes, and tells the relay where to send. */
export async function turnPushOn(): Promise<PushState> {
  // Asked first, straight from the tap: iPhones refuse the prompt after anything else has been awaited.
  if ((await Notification.requestPermission()) !== 'granted') return pushState()
  const { publicKey } = await pushKey()
  if (!publicKey) throw new Error('Notifications aren’t set up on the relay yet.')
  const reg = await navigator.serviceWorker.register('/viewer/sw.js', { scope: '/viewer/' })
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await subscribePush(sub.toJSON())
  return 'on'
}

/** Stops them here: the relay forgets this browser, and so does the push service. */
export async function turnPushOff(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration('/viewer/')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await unsubscribePush(sub.endpoint).catch(() => undefined)
    await sub.unsubscribe()
  }
  return pushState()
}
