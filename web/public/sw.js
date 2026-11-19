// The web app's service worker (web/push.ts registers it): shows the relay's push notifications (relay/src/lib/webPush.ts
// sends them) and opens the app when one is tapped. Nothing is cached: the app still loads from the network.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let message = { title: 'NoteGoblin', body: 'Something new.' }
  try {
    message = { ...message, ...event.data.json() }
  } catch {
    // An empty or unreadable push still says something arrived.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      // A newer one from the same thread replaces the old, and still buzzes.
      renotify: !!message.tag,
      icon: '/app/icon-192.png',
      badge: '/app/icon-192.png',
      data: { url: message.url || '/app/' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/app/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((open) => {
      const app = open.find((c) => new URL(c.url).pathname.startsWith('/app/'))
      return app ? app.focus() : self.clients.openWindow(url)
    })
  )
})
