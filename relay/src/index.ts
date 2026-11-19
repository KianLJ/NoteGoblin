import { routePartykitRequest } from 'partyserver'
import type { Env } from './env'
import { handleAudio, handleLibrary } from './audio'

export { Directory } from './directory'
export { Presence } from './presence'
export { Session } from './session'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    // The old phone viewer is gone: its links go to the web app. (Its Home Screen icons and notifications don't carry
    // over; the app needs adding to the Home Screen again, from /app/.)
    if (url.pathname === '/viewer' || url.pathname.startsWith('/viewer/')) return Response.redirect(new URL('/app/', url).toString(), 301)
    return (await handleLibrary(request, env, ctx)) ?? (await handleAudio(request, env)) ?? (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  }
} satisfies ExportedHandler<Env>
