import { routePartykitRequest } from 'partyserver'
import type { Env } from './env'
import { handleAudio, handleLibrary } from './audio'

export { Directory } from './directory'
export { Presence } from './presence'
export { Session } from './session'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return (await handleLibrary(request, env, ctx)) ?? (await handleAudio(request, env)) ?? (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  }
} satisfies ExportedHandler<Env>
