import { probeHostCertificate } from '../tls/probeHost'
import { pinnedRequest } from './pinnedHttpClient'

interface AuthResponseBody {
  token: string
  user: { id: string; displayName: string }
}

export async function probeAddress(address: string): Promise<{ fingerprint: string; certPem: string }> {
  const [host, portStr] = address.split(':')
  if (!host || !portStr || Number.isNaN(Number(portStr))) {
    throw new Error('Enter an address as host:port, e.g. 100.x.x.x:47331.')
  }
  return probeHostCertificate(host, Number(portStr))
}

/** Logs in with the given credentials, registering transparently if this is the first time this identity has talked to that host. */
export async function authenticateWithHost(
  address: string,
  certPem: string,
  displayName: string,
  password: string
): Promise<{ ok: true; token: string; userId: string } | { ok: false; error: string }> {
  const login = await pinnedRequest(address, certPem, '/auth/login', {
    method: 'POST',
    body: { displayName, password }
  })
  if (login.status === 200) {
    const body = login.body as AuthResponseBody
    return { ok: true, token: body.token, userId: body.user.id }
  }

  const register = await pinnedRequest(address, certPem, '/auth/register', {
    method: 'POST',
    body: { displayName, password }
  })
  if (register.status === 200) {
    const body = register.body as AuthResponseBody
    return { ok: true, token: body.token, userId: body.user.id }
  }
  if (register.status === 409) {
    return {
      ok: false,
      error: 'This host already has an account under your name with a different password.'
    }
  }
  return { ok: false, error: 'Could not reach or authenticate with that host.' }
}
