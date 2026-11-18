// The viewer's service worker: shows the relay's push notifications (relay/src/lib/webPush.ts sends them) and opens
// the viewer when one is tapped. Nothing is cached here: the viewer still loads from the network as before.

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
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: message.url || '/viewer/' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/viewer/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((open) => {
      const viewer = open.find((c) => new URL(c.url).pathname.startsWith('/viewer/'))
      return viewer ? viewer.focus() : self.clients.openWindow(url)
    })
  )
})
