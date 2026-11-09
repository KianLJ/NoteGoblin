import type { ChangelogEntry } from '../../data/changelog'
import { WHATS_NEW_POSTS } from '../../data/whatsNewPosts'
import './whatsNew.css'

const SEEN_KEY = 'gb-whats-new-seen'

/**
 * The version whose notes were last shown. A fresh install starts at the
 * version it is (nothing to announce); someone updating from before this
 * existed has no record but other app data, so they're shown this update's
 * notes once.
 */
export function lastSeenVersion(current: string): string {
  try {
    const seen = localStorage.getItem(SEEN_KEY)
    if (seen) return seen
    const usedBefore = Object.keys(localStorage).some((k) => k.startsWith('gb-'))
    return usedBefore ? '0.0.0' : current
  } catch {
    return current
  }
}

export function markWhatsNewSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    /* best-effort: worst case it shows once more */
  }
}

/**
 * The What's New box: each version's write-up, newest first, read like a
 * short blog post — a title, an intro, then a section per feature with its
 * screenshot. A version without a post shows its changelog bullet points.
 * Opens by itself on the first launch after an update, and from the
 * changelog any time after.
 */
export function WhatsNewView({ entries }: { entries: ChangelogEntry[] }): JSX.Element {
  return (
    <article className="gb-whatsnew">
      {entries.map((entry, n) => {
        const post = WHATS_NEW_POSTS.find((p) => p.version === entry.version)
        return (
          <section key={entry.version} className={n > 0 ? 'gb-whatsnew-post gb-whatsnew-post--older' : 'gb-whatsnew-post'}>
            <header className="gb-whatsnew-hero">
              <span className="gb-whatsnew-kicker">
                {n === 0 ? 'What’s new' : 'Earlier'} · v{entry.version}
              </span>
              <h1>{post?.title ?? entry.title}</h1>
              {post && <p className="gb-whatsnew-intro">{post.intro}</p>}
            </header>
            {post ? (
              post.sections.map((s) => (
                <div key={s.heading} className="gb-whatsnew-section">
                  <h2>{s.heading}</h2>
                  <p>{s.body}</p>
                  {s.image && (
                    <figure>
                      <img src={s.image} alt={s.caption ?? s.heading} loading="lazy" />
                      {s.caption && <figcaption>{s.caption}</figcaption>}
                    </figure>
                  )}
                </div>
              ))
            ) : (
              <ul className="gb-whatsnew-list">
                {entry.highlights.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </article>
  )
}
