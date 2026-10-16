// The same icons as ui/icons.tsx, as SVG markup strings — for the few
// buttons built outside React (the notes' rendered-markdown HTML and the live
// editor's CodeMirror widgets), which can't render a component. Fixed
// constants, never user content, so they're safe to insert as HTML.

const svg = (body: string, viewBox = '0 0 16 16', strokeWidth = '1.4'): string =>
  `<svg class="gb-inline-icon" width="13" height="13" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

/** characterSheetTabs/icons.tsx's DiceIcon (d20 wireframe). */
export const DICE_ICON_SVG = svg(
  '<path d="M12 1.5 L21.09 6.75 L21.09 17.25 L12 22.5 L2.91 17.25 L2.91 6.75 Z"/><path d="M12 5.51 L17.62 15.25 L6.38 15.25 Z"/><path d="M12 5.51 L12 1.5 M12 5.51 L21.09 6.75 M12 5.51 L2.91 6.75"/><path d="M17.62 15.25 L21.09 6.75 M17.62 15.25 L21.09 17.25 M17.62 15.25 L12 22.5"/><path d="M6.38 15.25 L12 22.5 M6.38 15.25 L2.91 17.25 M6.38 15.25 L2.91 6.75"/>',
  '0 0 24 24',
  '1.3'
)

/** ui/icons.tsx's SpeakerIcon. */
export const SPEAKER_ICON_SVG = svg('<path d="M2.5 6.2h2.3L8 3.5v9L4.8 9.8H2.5z"/><path d="M10.6 5.8a3 3 0 0 1 0 4.4M12.3 4.2a5.3 5.3 0 0 1 0 7.6"/>')
