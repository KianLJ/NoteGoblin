import goblinUrl from '../assets/goblin-loading.gif'
import './goblinLoader.css'

/**
 * NoteGoblin's loading sign: the goblin bent over its book, pencil scribbling (an animated GIF), above a line
 * saying what's loading. Anywhere the app is waiting on something: a box whose code is still arriving, a web page's first load,
 * a character or calendar coming over the session. It waits a moment before showing, so a quick load never flashes it.
 * (The startup screen is the same picture, in index.html.)
 */
export function GoblinLoader({
  size = 'md',
  label,
  fill = true,
  overlay = false
}: {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  /** Fills its box, the goblin in the middle. */
  fill?: boolean
  /** Over the whole window (for something that opens over everything, like the Codex). */
  overlay?: boolean
}): JSX.Element {
  if (overlay)
    return (
      <div className="gb-goblin-overlay">
        <GoblinLoader size={size} label={label} fill={false} />
      </div>
    )
  return (
    <div className={`gb-goblin-loader gb-goblin-loader--${size}${fill ? ' gb-goblin-loader--fill' : ''}`} role="status" aria-live="polite">
      <span className="gb-goblin-loader-art" aria-hidden="true">
        <img src={goblinUrl} alt="" draggable={false} />
      </span>
      <span className="gb-goblin-loader-label">
        {label ?? 'Loading'}
        <span className="gb-goblin-loader-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </span>
    </div>
  )
}
