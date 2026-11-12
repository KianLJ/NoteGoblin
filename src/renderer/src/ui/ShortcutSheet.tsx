import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { RAIL } from '../features/combat/MapToolbar'
import './shortcutSheet.css'

/** Every keyboard shortcut in the app, by where it works. The map's tool keys come from its toolbar, so they can't drift. */
const GROUPS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: 'Anywhere',
    keys: [
      ['Ctrl K', 'Search notes, tools, quests and more'],
      ['?', 'This list'],
      ['Ctrl Z', 'Undo a deletion, while “Undo” is showing']
    ]
  },
  {
    title: 'Writing a note',
    keys: [
      ['Ctrl E', 'Switch between writing and reading'],
      ['Ctrl B', 'Bold'],
      ['Ctrl I', 'Italic'],
      ['Ctrl Z', 'Undo typing'],
      ['Right-click', 'Format, insert, cut, copy and paste']
    ]
  },
  {
    title: 'A table in a note',
    keys: [
      ['Tab', 'Next cell (Shift Tab: the one before)'],
      ['Enter', 'The cell below — a new row at the end'],
      ['Esc', 'Leave the cell without changing it'],
      ['Right-click', 'Add, move, align or delete rows and columns']
    ]
  },
  {
    title: 'The notes list',
    keys: [
      ['F2', 'Rename'],
      ['Delete', 'Delete'],
      ['Ctrl A', 'Select everything'],
      ['Ctrl C / X / V', 'Copy, cut and paste notes']
    ]
  },
  {
    title: 'The battle map',
    keys: [
      ...RAIL.map((r): [string, string] => [r.key, r.label + (r.dmOnly ? ' (DM)' : '')]),
      ['Q / E', 'Turn the selected token'],
      ['Ctrl Z', 'Undo the last map change (Ctrl Y redoes it)']
    ]
  },
  {
    title: 'The Browser',
    keys: [
      ['Ctrl scroll', 'Zoom the page'],
      ['Ctrl + / − / 0', 'Zoom in, out, back to 100%'],
      ['Middle-click a tab', 'Close it']
    ]
  },
  {
    title: 'The canvas',
    keys: [
      ['Drag empty space', 'Pan (or two fingers on a trackpad)'],
      ['Ctrl scroll', 'Zoom (or pinch)'],
      ['Right-click', 'Add a sticky, an image, a Browser window…']
    ]
  }
]

/** `?` (outside a text box) opens it. */
export function ShortcutSheet(): JSX.Element {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return
      e.preventDefault()
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <Modal open={open} onClose={() => setOpen(false)} width={720}>
      <h2 className="gb-keys-title">Keyboard shortcuts</h2>
      <div className="gb-keys">
        {GROUPS.map((g) => (
          <section key={g.title} className="gb-keys-group">
            <h3>{g.title}</h3>
            <dl>
              {g.keys.map(([key, what]) => (
                <div key={key + what} className="gb-keys-row">
                  <dt>
                    {key.split(' / ').map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span className="gb-keys-or">/</span>}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
