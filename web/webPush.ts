// Puts the web app's push notifications on window.goblin (Settings' Notifications page uses them) and starts the
// service worker, after the preload has built window.goblin (see web/main.tsx).
import { pushState, registerServiceWorker, turnPushOff, turnPushOn } from './push'

registerServiceWorker()
window.goblin.webPush = { state: pushState, turnOn: turnPushOn, turnOff: turnPushOff }
