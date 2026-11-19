// The web app's stand-in for the `ws` package: the browser's own WebSocket, with the event-emitter methods
// (on, removeAllListeners, ping) that sessionClient.ts and relaySocket.ts call, so they run here unchanged.

type Fn = (...args: unknown[]) => void

export default class WebSocketShim {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  private readonly ws: WebSocket
  private readonly added: Array<[string, EventListener]> = []

  constructor(url: string) {
    this.ws = new WebSocket(url)
  }

  get readyState(): number {
    return this.ws.readyState
  }

  on(event: string, fn: Fn): this {
    const wrap: EventListener =
      event === 'message'
        ? (e) => fn((e as MessageEvent).data)
        : event === 'close'
          ? (e) => fn((e as CloseEvent).code, (e as CloseEvent).reason)
          : event === 'open'
            ? () => fn()
            : (e) => fn(e)
    this.ws.addEventListener(event, wrap)
    this.added.push([event, wrap])
    return this
  }

  removeAllListeners(): this {
    for (const [event, wrap] of this.added) this.ws.removeEventListener(event, wrap)
    this.added.length = 0
    return this
  }

  send(data: string): void {
    this.ws.send(data)
  }

  close(): void {
    this.ws.close()
  }

  /** Browsers keep the connection alive themselves; there's no ping to send. */
  ping(): void {}
}
