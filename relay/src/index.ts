import { routePartykitRequest } from 'partyserver'
import type { Env } from './env'
import { handleAudio, handleLibrary } from './audio'

export { Directory } from './directory'
export { Presence } from './presence'
export { Session } from './session'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    // The old phone viewer is the web app now. A phone that turned notifications on in it still has its service
    // worker at /viewer/sw.js: answering with the web app's keeps those notifications coming (and opening /app/),
    // where a missing file would quietly unregister it. Everything else under /viewer goes to the app.
    if (url.pathname === '/viewer' || url.pathname.startsWith('/viewer/')) {
      if (url.pathname === '/viewer/sw.js') return env.ASSETS.fetch(new Request(new URL('/app/sw.js', url), request))
      return Response.redirect(new URL('/app/', url).toString(), 301)
    }
    return (await handleLibrary(request, env, ctx)) ?? (await handleAudio(request, env)) ?? (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  }
} satisfies ExportedHandler<Env>
