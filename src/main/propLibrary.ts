import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { extname, join, relative, sep } from 'path'
import { shell } from 'electron'
import { findCampaignDir } from '@server/files/vaultStore'
import type { PropListing } from '@shared/ipc'

/**
 * A campaign's battle map props, as plain image files in a `.props` folder
 * inside the campaign's own vault folder — subfolders are the library's
 * folders and file names are the props' names, so a DM can tidy them in
 * Explorer too. The leading dot keeps the note scanner (which skips dot
 * entries) from showing it as a notes folder.
 */
const ROOT = '.props'
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/
const MAX_BYTES = 4_000_000

function rootOf(campaignId: string): string {
  const found = findCampaignDir(campaignId)
  if (!found) throw new Error('This campaign has no folder for props yet.')
  return join(found.dir, ROOT)
}

/** A name safe as one file or folder name: no path characters, no leading dots. */
export function cleanName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
}

/** A path inside the props folder, from its "/"-separated relative form; throws on anything that would leave it. */
function inside(root: string, rel: string): string {
  const parts = rel.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) throw new Error('Not a props path.')
  const abs = join(root, ...parts)
  if (abs !== root && !abs.startsWith(root + sep)) throw new Error('Not a props path.')
  return abs
}

/** `base` + extension, with " 2", " 3"… added until nothing in `dir` has that name. */
function freeName(dir: string, base: string, ext: string): string {
  let name = `${base}${ext}`
  for (let n = 2; existsSync(join(dir, name)); n++) name = `${base} ${n}${ext}`
  return name
}

export function listProps(campaignId: string): PropListing {
  const root = rootOf(campaignId)
  const listing: PropListing = { folders: [], props: [] }
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const abs = join(dir, entry.name)
      const rel = relative(root, abs).split(sep).join('/')
      if (entry.isDirectory()) {
        listing.folders.push(rel)
        walk(abs)
      } else if (IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
        const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
        listing.props.push({ path: rel, name: entry.name.slice(0, -extname(entry.name).length), folder })
      }
    }
  }
  walk(root)
  listing.folders.sort((a, b) => a.localeCompare(b))
  listing.props.sort((a, b) => a.name.localeCompare(b.name))
  return listing
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

export function readProp(campaignId: string, path: string): string {
  const abs = inside(rootOf(campaignId), path)
  const mime = MIME[extname(abs).toLowerCase()]
  if (!mime) throw new Error('Not a prop picture.')
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`
}

export function addProps(campaignId: string, folder: string, items: Array<{ name: string; dataUrl: string }>): PropListing {
  const root = rootOf(campaignId)
  const dir = inside(root, folder)
  mkdirSync(dir, { recursive: true })
  for (const item of items) {
    const m = DATA_URL.exec(item.dataUrl)
    if (!m) throw new Error('Props must be PNG, JPEG or WebP pictures.')
    const bytes = Buffer.from(m[2], 'base64')
    if (bytes.length > MAX_BYTES) throw new Error(`${item.name} is too big for a prop.`)
    const ext = m[1] === 'jpeg' ? '.jpg' : `.${m[1]}`
    writeFileSync(join(dir, freeName(dir, cleanName(item.name) || 'Prop', ext)), bytes)
  }
  return listProps(campaignId)
}

export function renameProp(campaignId: string, path: string, name: string): PropListing {
  const root = rootOf(campaignId)
  const abs = inside(root, path)
  const base = cleanName(name)
  if (!base) throw new Error('Give it a name.')
  const ext = extname(abs)
  const dir = join(abs, '..')
  const current = abs.slice(dir.length + 1)
  const wanted = `${base}${ext}`
  // Only the case changing ("table" to "Table") is the same file on Windows, so it's renamed as is.
  if (wanted !== current) renameSync(abs, join(dir, wanted.toLowerCase() === current.toLowerCase() ? wanted : freeName(dir, base, ext)))
  return listProps(campaignId)
}

export function moveProps(campaignId: string, paths: string[], folder: string): PropListing {
  const root = rootOf(campaignId)
  const dir = inside(root, folder)
  mkdirSync(dir, { recursive: true })
  for (const path of paths) {
    const abs = inside(root, path)
    if (join(abs, '..') === dir) continue
    const ext = extname(abs)
    renameSync(abs, join(dir, freeName(dir, abs.slice(abs.lastIndexOf(sep) + 1, -ext.length), ext)))
  }
  return listProps(campaignId)
}

/** Props and folders go to the Recycle Bin, not straight to deletion. */
export async function trashProps(campaignId: string, paths: string[]): Promise<PropListing> {
  const root = rootOf(campaignId)
  for (const path of paths) {
    const abs = inside(root, path)
    if (abs === root) throw new Error('Not a props path.')
    if (existsSync(abs)) await shell.trashItem(abs)
  }
  return listProps(campaignId)
}

export function createPropFolder(campaignId: string, parent: string, name: string): PropListing {
  const root = rootOf(campaignId)
  const base = cleanName(name)
  if (!base) throw new Error('Give the folder a name.')
  mkdirSync(inside(root, parent ? `${parent}/${base}` : base), { recursive: true })
  return listProps(campaignId)
}

export function renamePropFolder(campaignId: string, folder: string, name: string): PropListing {
  const root = rootOf(campaignId)
  const abs = inside(root, folder)
  if (abs === root) throw new Error('Not a props folder.')
  const base = cleanName(name)
  if (!base) throw new Error('Give the folder a name.')
  const dir = join(abs, '..')
  const target = join(dir, base)
  if (target !== abs) {
    if (existsSync(target) && target.toLowerCase() !== abs.toLowerCase()) throw new Error(`There’s already a folder called ${base}.`)
    renameSync(abs, target)
  }
  return listProps(campaignId)
}
