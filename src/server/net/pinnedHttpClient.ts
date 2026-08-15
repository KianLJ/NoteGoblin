import https from 'https'

export interface PinnedResponse {
  status: number
  body: unknown
}

export interface PinnedRequestInit {
  method: 'GET' | 'POST'
  body?: unknown
  token?: string
}

/**
 * Makes a request to a host, trusting ONLY the exact certificate passed in
 * (rather than any CA-signed cert, which self-signed certs aren't anyway).
 * This is the enforcement side of trust-on-first-connect: once a cert is
 * pinned, every later request is verified against that specific cert.
 */
export function pinnedRequest(
  address: string,
  certPem: string,
  path: string,
  init: PinnedRequestInit = { method: 'GET' }
): Promise<PinnedResponse> {
  const [host, portStr] = address.split(':')
  const port = Number(portStr)
  const payload = init.body !== undefined ? JSON.stringify(init.body) : undefined

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        port,
        path,
        method: init.method,
        ca: certPem,
        // We pin the exact certificate content, which is a stronger check than
        // hostname matching — and self-signed certs generated before we know a
        // player's LAN/Tailscale IP can't list every possible hostname/IP in
        // advance anyway. Chain validation against `ca` above still applies.
        checkServerIdentity: () => undefined,
        headers: {
          ...(payload
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload)
              }
            : {}),
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {})
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          let body: unknown = null
          try {
            body = raw ? JSON.parse(raw) : null
          } catch {
            body = raw
          }
          resolve({ status: res.statusCode ?? 0, body })
        })
      }
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}
