import { routePartykitRequest } from 'partyserver'
import type { Env } from './env'

export { Directory } from './directory'
export { Presence } from './presence'
export { Session } from './session'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  }
} satisfies ExportedHandler<Env>
