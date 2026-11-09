/**
 * Where menus and dialogs render (App.tsx's #gb-popup-layer). A
 * `position: fixed` element inside the workspace canvas would be anchored to
 * the canvas's zoomed layer instead of the window; rendered here it sits
 * above everything, still inside the font-scale box its maths expects.
 */
export function popupLayer(): HTMLElement {
  return document.getElementById('gb-popup-layer') ?? document.body
}
