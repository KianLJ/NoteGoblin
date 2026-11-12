import { useEffect, useRef, useState } from 'react'
import { coinLabel, coinList, STANDARD_COINS } from '@shared/quests'
import type { CampaignStash, StashChange, StashItem } from '@shared/stash'
import { CoinGlyph, coinStyle, useCampaignPlayers, useCoinNames } from './QuestLog'
import { offerUndo } from '../../ui/undo'
import { useBrowserAccount } from '../browser/browserAccount'
import { XIcon } from '../../ui/icons'
import { CodexItemPicker, openCodexEntry } from './CodexItemPicker'

/**
 * The party stash (shared/stash.ts), the Quests box's second tab: the party's shared loot and purse. Anyone at the
 * table adds things, takes one to carry (it's marked theirs), puts it back, and puts coins in or takes them out.
 * Items a finished quest pays land here. Every change goes to the DM's computer one at a time, and everyone re-reads.
 */
/** The character a player is playing: coins taken out of the stash are added to them, and coins put in come from them. */
export interface StashPurse {
  name: string
  give: (coin: string, n: number) => void
  /** False if they haven't got that many. */
  take: (coin: string, n: number) => boolean
}

export function PartyStash({ sessionId, campaignId, isDm, purse }: { sessionId: string | null; campaignId: string | null; isDm: boolean; purse?: StashPurse }): JSX.Element {
  const [stash, setStash] = useState<CampaignStash | null>(null)
  const [error, setError] = useState<string | null>(null)
  const players = useCampaignPlayers(campaignId, sessionId)
  const coinNames = useCoinNames()
  const me = useBrowserAccount()

  useEffect(() => {
    if (!campaignId) return setStash(null)
    const read = (): void => {
      void window.goblin.stash.get(campaignId, sessionId ?? undefined).then((r) => {
        if (r.ok) setStash(r.data)
        else setError(r.error)
      })
    }
    read()
    return window.goblin.campaigns.onChanged((e) => {
      if (e.campaignId === campaignId) read()
    })
  }, [campaignId, sessionId])

  async function change(c: StashChange): Promise<boolean> {
    if (!campaignId) return false
    const r = await window.goblin.stash.change(campaignId, c, sessionId ?? undefined)
    if (r.ok) {
      setStash(r.data)
      setError(null)
    } else setError(r.error)
    return r.ok
  }

  /** Who's carrying it, as the reader sees it. */
  const holder = (item: StashItem): string | null => {
    if (!item.heldBy) return null
    const player = players.find((p) => p.userId === item.heldBy)
    if (player) return item.heldBy === me ? 'You' : player.displayName
    // Not one of the players: the DM — who's reading this, on the DM's side.
    return isDm ? 'You' : 'The DM'
  }
  const mine = (item: StashItem): boolean => holder(item) === 'You'

  function remove(item: StashItem): void {
    void change({ op: 'remove', id: item.id }).then((ok) => {
      if (ok) offerUndo(`Removed ${item.name}`, () => void change({ op: 'add', name: item.name, qty: item.qty, note: item.note }))
    })
  }

  if (!campaignId) return <p className="gb-stash-empty">Open a campaign to see the party’s stash.</p>
  const coins = coinList(stash?.coins)
  const kept = stash?.items.filter((i) => !i.heldBy) ?? []
  const carried = stash?.items.filter((i) => i.heldBy) ?? []

  return (
    <div className="gb-stash">
      <section className="gb-stash-purse" aria-label="The party’s coins">
        <div className="gb-quests-heading">Purse</div>
        <div className="gb-quest-rewards">
          {coins.length === 0 ? (
            <span className="gb-stash-hint">No coins in the stash yet.</span>
          ) : (
            coins.map(([id, n]) => (
              <span key={id} className="gb-reward gb-reward--coin" style={coinStyle(id)}>
                <CoinGlyph />
                {n.toLocaleString()} {coinLabel(id, coinNames)}
              </span>
            ))
          )}
        </div>
        <CoinForm
          coinNames={coinNames}
          purseName={purse?.name}
          onChange={async (coin, delta) => {
            if (!purse) return change({ op: 'coins', coin, delta })
            // Into the stash: out of your purse first, back into it if the stash refuses.
            if (delta > 0) {
              if (!purse.take(coin, delta)) {
                setError(`${purse.name} hasn’t got that many.`)
                return false
              }
              const ok = await change({ op: 'coins', coin, delta })
              if (!ok) purse.give(coin, delta)
              return ok
            }
            const ok = await change({ op: 'coins', coin, delta })
            if (ok) purse.give(coin, -delta)
            return ok
          }}
        />
      </section>

      <section aria-label="Items in the stash">
        <div className="gb-quests-heading">In the stash · {kept.length}</div>
        {kept.length === 0 && <p className="gb-stash-hint">Nothing here. Add loot below, or finish a quest that pays an item.</p>}
        <ul className="gb-stash-list">
          {kept.map((item) => (
            <ItemRow key={item.id} item={item} holder={null} onChange={change} onRemove={() => remove(item)} canPutBack={false} />
          ))}
        </ul>
        <AddItemForm onAdd={(name, qty) => change({ op: 'add', name, qty })} />
        <div className="gb-stash-codex">
          <CodexItemPicker label="+ An item from the Codex" onPick={(ref) => void change({ op: 'add', name: ref.name, codex: { kind: ref.kind, id: ref.id } })} />
        </div>
      </section>

      {carried.length > 0 && (
        <section aria-label="Items someone is carrying">
          <div className="gb-quests-heading">Being carried · {carried.length}</div>
          <ul className="gb-stash-list">
            {carried.map((item) => (
              <ItemRow key={item.id} item={item} holder={holder(item)} onChange={change} onRemove={() => remove(item)} canPutBack={mine(item) || isDm} />
            ))}
          </ul>
        </section>
      )}
      {error && <p className="gb-quests-error">{error}</p>}
    </div>
  )
}

function ItemRow({
  item,
  holder,
  canPutBack,
  onChange,
  onRemove
}: {
  item: StashItem
  holder: string | null
  canPutBack: boolean
  onChange: (c: StashChange) => Promise<boolean>
  onRemove: () => void
}): JSX.Element {
  return (
    <li className={`gb-stash-item${item.heldBy ? ' gb-stash-item--held' : ''}`}>
      <div className="gb-stash-item-main">
        {item.codex ? (
          <button type="button" className="gb-stash-item-name gb-codex-link" title={`Open ${item.name} from the Codex`} onClick={(e) => openCodexEntry(e.currentTarget, { ...item.codex!, name: item.name })}>
            {item.name}
          </button>
        ) : (
          <span className="gb-stash-item-name">{item.name}</span>
        )}
        {item.note && <span className="gb-stash-item-note">{item.note}</span>}
        {holder && <span className="gb-stash-holder">{holder === 'You' ? 'You have it' : `${holder} has it`}</span>}
      </div>
      <span className="gb-stash-qty" role="group" aria-label={`How many: ${item.qty}`}>
        <button type="button" onClick={() => void onChange({ op: 'qty', id: item.id, delta: -1 })} disabled={item.qty <= 1} aria-label="One fewer">
          −
        </button>
        <span>{item.qty}</span>
        <button type="button" onClick={() => void onChange({ op: 'qty', id: item.id, delta: 1 })} aria-label="One more">
          +
        </button>
      </span>
      {item.heldBy ? (
        canPutBack && (
          <button type="button" className="gb-stash-act" onClick={() => void onChange({ op: 'return', id: item.id })}>
            Put back
          </button>
        )
      ) : (
        <button type="button" className="gb-stash-act" onClick={() => void onChange({ op: 'take', id: item.id })} title="Take it to carry: it’s marked as yours">
          Take
        </button>
      )}
      {(!item.heldBy || canPutBack) && (
        <button type="button" className="gb-switcher-icon gb-switcher-icon--danger" onClick={onRemove} title="Remove it from the stash" aria-label={`Remove ${item.name}`}>
          <XIcon size={11} />
        </button>
      )}
    </li>
  )
}

function AddItemForm({ onAdd }: { onAdd: (name: string, qty: number) => Promise<boolean> }): JSX.Element {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const input = useRef<HTMLInputElement>(null)
  return (
    <form
      className="gb-stash-add"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        void onAdd(name.trim(), Math.max(1, Math.floor(Number(qty)) || 1)).then((ok) => {
          if (!ok) return
          setName('')
          setQty('1')
          input.current?.focus()
        })
      }}
    >
      <input ref={input} className="gb-input" value={name} placeholder="Add loot: a potion, a strange idol…" aria-label="Item to add" maxLength={120} onChange={(e) => setName(e.target.value)} />
      <input className="gb-input gb-stash-add-qty" value={qty} inputMode="numeric" aria-label="How many" onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, '').slice(0, 5))} />
      <button type="submit" className="gb-quest-form-save" disabled={!name.trim()}>
        Add
      </button>
    </form>
  )
}

function CoinForm({
  coinNames,
  purseName,
  onChange
}: {
  coinNames: { id: string; name: string }[]
  purseName?: string
  onChange: (coin: string, delta: number) => Promise<boolean>
}): JSX.Element {
  const [amount, setAmount] = useState('')
  const [coin, setCoin] = useState('gp')
  const all = [...STANDARD_COINS, ...coinNames.map((c) => c.id).filter((id) => !(STANDARD_COINS as readonly string[]).includes(id))]
  const n = Math.floor(Number(amount))
  const go = (sign: 1 | -1): void => {
    if (!n) return
    void onChange(coin, sign * n).then((ok) => ok && setAmount(''))
  }
  return (
    <div className="gb-stash-coins">
      <input className="gb-input gb-stash-add-qty" value={amount} inputMode="numeric" placeholder="0" aria-label="How many coins" onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 7))} />
      <select className="gb-input gb-stash-coin" value={coin} aria-label="Which coin" onChange={(e) => setCoin(e.target.value)}>
        {all.map((id) => (
          <option key={id} value={id}>
            {coinLabel(id, coinNames)}
          </option>
        ))}
      </select>
      <button type="button" className="gb-stash-act" disabled={!n} onClick={() => go(1)} title={purseName ? `From ${purseName}’s purse` : undefined}>
        Put in
      </button>
      <button type="button" className="gb-stash-act" disabled={!n} onClick={() => go(-1)} title={purseName ? `Into ${purseName}’s purse` : undefined}>
        Take out
      </button>
      {purseName && <span className="gb-stash-hint gb-stash-purse-who">From and to {purseName}’s purse</span>}
    </div>
  )
}
