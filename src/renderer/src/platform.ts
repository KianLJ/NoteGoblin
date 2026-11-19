/** The web app (web/main.tsx) rather than the desktop: players only, no window controls, no local files. */
export const isWebApp = (): boolean => (window as unknown as { __NG_WEB__?: boolean }).__NG_WEB__ === true
