import { createContext } from 'react'

/**
 * The canvas's zoom, for what inside a box can't follow it by itself — a web page in the Browser box keeps its own
 * size under CSS zoom, so it's zoomed to match, and it's too slow to redraw on every frame of a zoom.
 * `zoom`: what the boxes are laid out at (Canvas.tsx's laidOutZoom, a CSS zoom). `zooming`: a zoom is under way
 * (the boxes are being scaled on top until it settles). Outside a canvas, 1 and never.
 */
export const CanvasZoomContext = createContext<{ zoom: number; zooming: boolean }>({ zoom: 1, zooming: false })
