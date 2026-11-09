import { setClassicLayout, useClassicLayout } from '../classic/classicLayout'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { useMountAnimation } from '../../ui/useMountAnimation'
import { GearIcon } from './icons'
import { Modal } from '../../ui/Modal'
import { XIcon } from '../../ui/icons'
import './account.css'
import { readAvatarFile, saveMyAvatar, useMyAvatar } from './avatar'
import { ColorTokenEditor } from './ColorTokenEditor'
import { emitIdentitySwitched } from '../auth/identityEvents'
import {
  FONT_SCALE_STEPS,
  getStoredFontId,
  getStoredFontScale,
  getStoredMode,
  isSystemFontId,
  makeSystemFontId,
  querySystemFonts,
  setFont,
  setFontScale,
  setThemeMode,
  systemFontFamily,
  type ThemeMode
} from '../../theme'
import type { Identity } from '@shared/ipc'
import type { AdminAccountSummary } from '@shared/relay'
import { getStoredSfxEnabled, getStoredSfxVolume, setSfxEnabled, setSfxVolume } from '../audio/soundSettings'
import { playSfx } from '../audio/soundEffects'

type SettingsSection = 'profile' | 'appearance' | 'sound' | 'folder' | 'account' | 'admin' | 'about'

/**
 * Your account, top left beside the mode switch: a circle with your initial.
 * Click it for a small menu (your name, settings, light or dark, sign out);
 * Settings opens the full window.
 */
export function AccountButton({ displayName }: { displayName: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsSection | null>(null)
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getStoredMode())
  const containerRef = useRef<HTMLDivElement>(null)
  const { rendered, closing } = useMountAnimation(open)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function openSettings(section: SettingsSection): void {
    setOpen(false)
    setSettings(section)
  }

  const initial = displayName.trim().charAt(0).toUpperCase() || '?'
  const avatar = useMyAvatar()
  const face = avatar ? <img className="gb-face-img" src={avatar} alt="" /> : initial
  return (
    <div ref={containerRef} className="ac">
      <button type="button" className={`ac-avatar${open ? ' ac-avatar--open' : ''}`} onClick={() => setOpen((o) => !o)} title={`${displayName}: account and settings`} aria-label="Account and settings" aria-expanded={open}>
        {face}
      </button>
      {rendered && (
        <div className={`ac-menu${closing ? ' gb-pop-out' : ''}`} role="menu">
          <div className="ac-who">
            <span className="ac-avatar ac-avatar--big" aria-hidden="true">
              {face}
            </span>
            <span className="ac-who-text">
              <strong>{displayName}</strong>
              <small>Signed in on this computer</small>
            </span>
          </div>
          <div className="ac-theme" role="radiogroup" aria-label="Theme">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={themeMode === mode}
                className={themeMode === mode ? 'ac-theme-btn ac-theme-btn--on' : 'ac-theme-btn'}
                onClick={() => {
                  setThemeMode(mode)
                  setThemeModeState(mode)
                }}
              >
                {mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'}
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" className="ac-item" onClick={() => openSettings('profile')}>
            <GearIcon />
            Settings
          </button>
          <button type="button" role="menuitem" className="ac-item" onClick={() => openSettings('appearance')}>
            <PaletteIcon />
            Appearance and fonts
          </button>
          <button type="button" role="menuitem" className="ac-item" onClick={() => openSettings('sound')}>
            <SoundIcon />
            Sound
          </button>
          <div className="ac-sep" />
          <button
            type="button"
            role="menuitem"
            className="ac-item ac-item--quiet"
            onClick={async () => {
              setOpen(false)
              await window.goblin.identity.signOut()
              emitIdentitySwitched(null)
            }}
          >
            <SignOutIcon />
            Sign out
          </button>
        </div>
      )}
      {settings && <SettingsWindow initialSection={settings} onClose={() => setSettings(null)} />}
    </div>
  )
}

const SECTIONS: { id: SettingsSection; label: string; about: string }[] = [
  { id: 'profile', label: 'Profile', about: 'The name other people see.' },
  { id: 'appearance', label: 'Appearance', about: 'Light or dark, the size of everything, fonts and colours.' },
  { id: 'sound', label: 'Sound', about: 'The little sounds for dice, rests and people joining.' },
  { id: 'folder', label: 'Notes folder', about: 'Where your campaigns are kept on this computer.' },
  { id: 'account', label: 'Account', about: 'Your password, and staying signed in.' },
  { id: 'admin', label: 'Relay admin', about: 'Accounts on the relay.' },
  { id: 'about', label: 'About', about: 'Licences for the rules content in NoteGoblin.' }
]

function SettingsWindow({ initialSection, onClose }: { initialSection: SettingsSection; onClose: () => void }): JSX.Element {
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)
  const avatar = useMyAvatar()
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  const [remembered, setRemembered] = useState<boolean | null>(null)

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getStoredMode())
  const [fontId, setFontIdState] = useState<string>(() => getStoredFontId())
  const [fontScale, setFontScaleState] = useState<number>(() => getStoredFontScale())
  const [systemFonts, setSystemFonts] = useState<string[] | null>(null)
  const classicLayout = useClassicLayout()
  const [sfxEnabled, setSfxEnabledState] = useState<boolean>(() => getStoredSfxEnabled())
  const [sfxVolume, setSfxVolumeState] = useState<number>(() => getStoredSfxVolume())
  const [signingOut, setSigningOut] = useState(false)

  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountSummary[] | null>(null)
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [vaultPath, setVaultPathState] = useState<string | null | undefined>(undefined)
  const [vaultBusy, setVaultBusy] = useState(false)
  const [vaultError, setVaultError] = useState<string | null>(null)
  const [vaultMigrated, setVaultMigrated] = useState<{ campaigns: number; notes: number; folders: number } | null>(null)

  function chooseThemeMode(mode: ThemeMode): void {
    setThemeMode(mode)
    setThemeModeState(mode)
  }

  function chooseFont(id: string): void {
    setFont(id)
    setFontIdState(id)
  }

  function chooseFontScale(scale: number): void {
    setFontScale(scale)
    setFontScaleState(scale)
  }

  function chooseSfxEnabled(enabled: boolean): void {
    setSfxEnabled(enabled)
    setSfxEnabledState(enabled)
    if (enabled) playSfx('diceRoll')
  }


  function chooseSfxVolume(volume: number): void {
    setSfxVolume(volume)
    setSfxVolumeState(volume)
  }

  function loadSystemFonts(): void {
    if (systemFonts !== null) return
    querySystemFonts().then(setSystemFonts)
  }

  useEffect(() => {
    window.goblin.identity.getCurrent().then((i) => {
      if (i) {
        setIdentity(i)
        setDisplayName(i.displayName)
      }
    })
    window.goblin.identity.hasRemembered().then(setRemembered)
  }, [])

  async function setPicture(make: () => Promise<string | null>): Promise<void> {
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      setAvatarError(await saveMyAvatar(await make()))
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Couldn’t save the picture.')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function saveDisplayName(): Promise<void> {
    setNameError(null)
    setNameSaved(false)
    if (displayName.trim().length < 2) {
      setNameError('Pick a display name with at least 2 characters.')
      return
    }
    const result = await window.goblin.identity.updateDisplayName(displayName.trim())
    if (!result.ok) {
      setNameError(result.error)
      return
    }
    setIdentity(result.identity)
    setNameSaved(true)
  }

  async function savePassword(): Promise<void> {
    setPasswordError(null)
    setPasswordSaved(false)
    if (newPassword.length < 8) {
      setPasswordError('New password should be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    const result = await window.goblin.identity.changePassword(currentPassword, newPassword)
    if (!result.ok) {
      setPasswordError(result.error)
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordSaved(true)
  }

  async function toggleRemembered(): Promise<void> {
    const next = !remembered
    const result = await window.goblin.identity.remember(next)
    if (result.ok) setRemembered(next)
  }

  async function signOut(): Promise<void> {
    setSigningOut(true)
    await window.goblin.identity.signOut()
    emitIdentitySwitched(null)
  }

  async function loadAdminAccounts(): Promise<void> {
    setAdminError(null)
    const result = await window.goblin.relay.admin.listAccounts()
    if (!result.ok) {
      setAdminError(result.error)
      setAdminAccounts(null)
      return
    }
    setAdminAccounts(result.data)
  }

  async function loadVaultPath(): Promise<void> {
    setVaultPathState(await window.goblin.files.getVaultPath())
  }

  async function chooseVaultFolder(): Promise<void> {
    setVaultError(null)
    setVaultMigrated(null)
    setVaultBusy(true)
    const result = await window.goblin.files.chooseVaultFolder()
    setVaultBusy(false)
    if (!result.ok) {
      if (result.error !== 'Cancelled.') setVaultError(result.error)
      return
    }
    setVaultPathState(result.data.vaultPath)
    setVaultMigrated(result.data.migrated)
  }

  async function removeAdminAccount(account: AdminAccountSummary): Promise<void> {
    if (!window.confirm(`Delete the relay account "${account.username}"? This can't be undone.`)) return
    setAdminBusyId(account.userId)
    setAdminError(null)
    const result = await window.goblin.relay.admin.removeAccount(account.userId)
    setAdminBusyId(null)
    if (!result.ok) {
      setAdminError(result.error)
      return
    }
    setAdminAccounts((prev) => prev?.filter((a) => a.userId !== account.userId) ?? prev)
  }

  function startEditAdminAccount(account: AdminAccountSummary): void {
    setEditingAccountId(account.userId)
    setEditUsername(account.username)
    setEditPassword('')
    setEditError(null)
  }

  async function saveAdminAccountEdit(account: AdminAccountSummary): Promise<void> {
    const trimmedUsername = editUsername.trim()
    if (trimmedUsername.length < 3) {
      setEditError('Display name must be at least 3 characters.')
      return
    }
    if (editPassword && editPassword.length < 8) {
      setEditError('New password must be at least 8 characters.')
      return
    }
    setAdminBusyId(account.userId)
    setEditError(null)
    const input: { username?: string; newPassword?: string } = {}
    if (trimmedUsername !== account.username) input.username = trimmedUsername
    if (editPassword) input.newPassword = editPassword
    const result = await window.goblin.relay.admin.updateAccount(account.userId, input)
    setAdminBusyId(null)
    if (!result.ok) {
      setEditError(result.error)
      return
    }
    setAdminAccounts((prev) =>
      prev?.map((a) => (a.userId === account.userId ? { ...a, username: result.data.username } : a)) ?? prev
    )
    setEditingAccountId(null)
    setEditPassword('')
  }

  // Each page loads what it needs the first time it's shown.
  useEffect(() => {
    if (section === 'appearance') loadSystemFonts()
    if (section === 'folder' && vaultPath === undefined) void loadVaultPath()
    if (section === 'admin' && adminAccounts === null) void loadAdminAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  const isAdmin = identity?.displayName.trim().toLowerCase() === 'kyonk'
  const sections = SECTIONS.filter((s) => s.id !== 'admin' || isAdmin)
  const current = sections.find((s) => s.id === section) ?? sections[0]

  return (
    <Modal onClose={onClose} width={780}>
      <div className="st">
        <nav className="st-nav" aria-label="Settings">
          <h2>Settings</h2>
          {sections.map((s) => (
            <button key={s.id} type="button" className={current.id === s.id ? 'st-tab st-tab--on' : 'st-tab'} onClick={() => setSection(s.id)} aria-current={current.id === s.id ? 'page' : undefined}>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="st-page">
          <header className="st-page-head">
            <h3>{current.label}</h3>
            <p>{current.about}</p>
            <button type="button" className="st-close" onClick={onClose} title="Close" aria-label="Close settings">
              <XIcon size={14} />
            </button>
          </header>

          {!identity ? (
            <p className="st-hint">Loading…</p>
          ) : current.id === 'profile' ? (
            <div className="st-group">
              <div className="st-profile">
                <div className="st-avatar">
                  <label className="ac-avatar ac-avatar--huge st-avatar-pick" title="Choose a picture">
                    {avatar ? <img className="gb-face-img" src={avatar} alt="" /> : (displayName.trim() || identity.displayName).charAt(0).toUpperCase()}
                    <span className="st-avatar-overlay">{avatarBusy ? 'Saving' : 'Change'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      aria-label="Choose a profile picture"
                      disabled={avatarBusy}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (file) void setPicture(() => readAvatarFile(file))
                      }}
                    />
                  </label>
                  {avatar && (
                    <button type="button" className="st-link" disabled={avatarBusy} onClick={() => void setPicture(async () => null)}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="st-field">
                  <label htmlFor="settings-display-name">Display name</label>
                  <form
                    className="st-inline"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void saveDisplayName()
                    }}
                  >
                    <input
                      id="settings-display-name"
                      className="gb-input"
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value)
                        setNameSaved(false)
                      }}
                    />
                    <Button variant="primary" type="submit" disabled={displayName.trim() === identity.displayName}>
                      Save
                    </Button>
                  </form>
                  {nameError && <p className="st-msg st-msg--bad">{nameError}</p>}
                  {nameSaved && <p className="st-msg st-msg--good">Saved.</p>}
                  <small className="st-hint">Click your picture to change it. Friends and your party see it too.</small>
                  {avatarError && <p className="st-msg st-msg--bad">{avatarError}</p>}
                </div>
              </div>
            </div>
          ) : current.id === 'appearance' ? (
            <>
              <div className="st-group">
                <div className="st-row">
                  <span className="st-row-text">
                    <strong>Theme</strong>
                    <small>System follows your computer’s light or dark setting.</small>
                  </span>
                  <Segmented
                    value={themeMode}
                    options={[
                      ['light', 'Light'],
                      ['dark', 'Dark'],
                      ['system', 'System']
                    ]}
                    onChange={(m) => chooseThemeMode(m as ThemeMode)}
                  />
                </div>
                <div className="st-row">
                  <span className="st-row-text">
                    <strong>Size</strong>
                    <small>Scales everything in the app, not just text.</small>
                  </span>
                  <Segmented value={String(fontScale)} options={FONT_SCALE_STEPS.map((sc) => [String(sc), `${Math.round(sc * 100)}%`])} onChange={(v) => chooseFontScale(Number(v))} />
                </div>
                <label className="st-row st-row--click">
                  <span className="st-row-text">
                    <strong>Classic layout</strong>
                    <small>The DM and player screens with sidebars and tabs, as before the canvas.</small>
                  </span>
                  <Switch checked={classicLayout} onChange={setClassicLayout} label="Classic layout" />
                </label>
              </div>
              <div className="st-group">
                <div className="st-row st-row--stack">
                  <span className="st-row-text">
                    <strong>Font</strong>
                    <small>Any font installed on this computer. If one looks too big, bring the size down above.</small>
                  </span>
                  <div className="st-inline">
                    <button type="button" className={!isSystemFontId(fontId) ? 'st-chip st-chip--on' : 'st-chip'} onClick={() => chooseFont('default')}>
                      Default
                    </button>
                    {systemFonts === null ? (
                      <span className="st-hint">Loading fonts…</span>
                    ) : systemFonts.length === 0 ? (
                      <span className="st-hint">No fonts to browse on this computer.</span>
                    ) : (
                      <select
                        className="gb-input"
                        value={isSystemFontId(fontId) ? systemFontFamily(fontId) : ''}
                        onChange={(e) => {
                          if (e.target.value) chooseFont(makeSystemFontId(e.target.value))
                        }}
                        aria-label="Font on this computer"
                      >
                        <option value="">Pick a font…</option>
                        {systemFonts.map((family) => (
                          <option key={family} value={family} style={{ fontFamily: family }}>
                            {family}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
              <div className="st-group">
                <div className="st-row st-row--stack">
                  <span className="st-row-text">
                    <strong>Colours</strong>
                    <small>Change any of the theme’s colours.</small>
                  </span>
                  <ColorTokenEditor themeMode={themeMode} />
                </div>
              </div>
            </>
          ) : current.id === 'sound' ? (
            <div className="st-group">
              <label className="st-row st-row--click">
                <span className="st-row-text">
                  <strong>Sound effects</strong>
                  <small>Short cues for dice rolls, rests, and people joining or leaving. Never anything that gives away a private roll.</small>
                </span>
                <Switch checked={sfxEnabled} onChange={chooseSfxEnabled} label="Sound effects" />
              </label>
              <div className={`st-row${sfxEnabled ? '' : ' st-row--off'}`}>
                <span className="st-row-text">
                  <strong>Volume</strong>
                </span>
                <div className="st-inline st-volume">
                  <input
                    type="range"
                    className="gb-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={sfxVolume}
                    disabled={!sfxEnabled}
                    onChange={(e) => chooseSfxVolume(Number(e.target.value))}
                    onMouseUp={() => playSfx('diceRoll')}
                    aria-label="Sound effects volume"
                  />
                  <span className="st-value">{Math.round(sfxVolume * 100)}%</span>
                </div>
              </div>
            </div>
          ) : current.id === 'folder' ? (
            <div className="st-group">
              <div className="st-row st-row--stack">
                {vaultPath ? (
                  <>
                    <span className="st-row-text">
                      <strong>Your campaigns are stored as files in</strong>
                      <small>Each campaign gets its own folder; notes are plain .md files you can open, copy or share.</small>
                    </span>
                    <code className="st-path">{vaultPath}</code>
                  </>
                ) : (
                  <span className="st-row-text">
                    <strong>Inside NoteGoblin</strong>
                    <small>Pick a folder to keep your campaigns as real files instead. Your campaigns are copied there; nothing is deleted.</small>
                  </span>
                )}
                <div className="st-inline">
                  <Button variant="secondary" onClick={chooseVaultFolder} disabled={vaultBusy}>
                    {vaultBusy ? 'Copying…' : vaultPath ? 'Choose a different folder…' : 'Choose a folder…'}
                  </Button>
                </div>
                {vaultError && <p className="st-msg st-msg--bad">{vaultError}</p>}
                {vaultMigrated && (
                  <p className="st-msg st-msg--good">
                    Copied {vaultMigrated.campaigns} campaign{vaultMigrated.campaigns === 1 ? '' : 's'}, {vaultMigrated.notes} note{vaultMigrated.notes === 1 ? '' : 's'} and {vaultMigrated.folders} folder
                    {vaultMigrated.folders === 1 ? '' : 's'}.
                  </p>
                )}
              </div>
            </div>
          ) : current.id === 'account' ? (
            <>
              <div className="st-group">
                <label className="st-row st-row--click">
                  <span className="st-row-text">
                    <strong>Stay signed in</strong>
                    <small>Opens straight into this account next time, without asking for your password.</small>
                  </span>
                  <Switch checked={!!remembered} onChange={() => void toggleRemembered()} label="Stay signed in" />
                </label>
              </div>
              <form
                className="st-group"
                onSubmit={(e) => {
                  e.preventDefault()
                  void savePassword()
                }}
              >
                <div className="st-row st-row--stack">
                  <span className="st-row-text">
                    <strong>Change password</strong>
                    <small>At least 8 characters.</small>
                  </span>
                  <div className="st-passwords">
                    <input type="password" className="gb-input" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" aria-label="Current password" />
                    <input type="password" className="gb-input" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" aria-label="New password" />
                    <input type="password" className="gb-input" placeholder="New password again" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" aria-label="Confirm new password" />
                  </div>
                  <div className="st-inline">
                    <Button variant="secondary" type="submit" disabled={!currentPassword || !newPassword}>
                      Change password
                    </Button>
                    {passwordError && <span className="st-msg st-msg--bad">{passwordError}</span>}
                    {passwordSaved && <span className="st-msg st-msg--good">Password changed.</span>}
                  </div>
                </div>
              </form>
              <div className="st-group">
                <div className="st-row">
                  <span className="st-row-text">
                    <strong>Sign out</strong>
                    <small>Back to the sign-in screen. Your campaigns and characters stay on this computer.</small>
                  </span>
                  <Button variant="secondary" onClick={signOut} disabled={signingOut}>
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </Button>
                </div>
              </div>
            </>
          ) : current.id === 'admin' ? (
            <div className="st-group">
              {adminAccounts === null ? (
                <p className="st-hint">Loading…</p>
              ) : adminAccounts.length === 0 ? (
                <p className="st-hint">No accounts.</p>
              ) : (
                adminAccounts.map((account) => (
                  <div key={account.userId} className="st-row st-row--stack">
                    <div className="st-inline st-admin-head">
                      <span className="st-row-text">
                        <strong>{account.username}</strong>
                        <small>
                          {account.friendCount} friend{account.friendCount === 1 ? '' : 's'}
                          {account.incomingRequestCount > 0 && ` · ${account.incomingRequestCount} incoming`}
                          {account.outgoingRequestCount > 0 && ` · ${account.outgoingRequestCount} outgoing`}
                        </small>
                      </span>
                      <Button variant="ghost" onClick={() => (editingAccountId === account.userId ? setEditingAccountId(null) : startEditAdminAccount(account))}>
                        {editingAccountId === account.userId ? 'Cancel' : 'Edit'}
                      </Button>
                      <Button variant="ghost" className="st-danger" onClick={() => removeAdminAccount(account)} disabled={adminBusyId === account.userId}>
                        {adminBusyId === account.userId ? 'Working…' : 'Delete'}
                      </Button>
                    </div>
                    {editingAccountId === account.userId && (
                      <div className="st-passwords">
                        <input className="gb-input" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} aria-label="Display name" placeholder="Display name" />
                        <input type="password" className="gb-input" placeholder="New password (blank keeps it)" autoComplete="new-password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} aria-label="New password" />
                        <div className="st-inline">
                          <Button variant="secondary" onClick={() => saveAdminAccountEdit(account)} disabled={adminBusyId === account.userId}>
                            {adminBusyId === account.userId ? 'Saving…' : 'Save'}
                          </Button>
                          {editError && <span className="st-msg st-msg--bad">{editError}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              {adminError && <p className="st-msg st-msg--bad">{adminError}</p>}
            </div>
          ) : (
            <div className="st-group">
              <p className="st-legal">
                This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at{' '}
                <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noreferrer">
                  dndbeyond.com/srd
                </a>
                . The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at{' '}
                <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">
                  creativecommons.org/licenses/by/4.0
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** A row of choices, one picked. */
function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (value: string) => void }): JSX.Element {
  return (
    <div className="st-segment" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'st-seg st-seg--on' : 'st-seg'} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** An on/off switch (a real checkbox underneath). */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }): JSX.Element {
  return (
    <span className="st-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="st-switch-track" />
    </span>
  )
}

function PaletteIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M8 1.8a6.2 6.2 0 1 0 0 12.4c1 0 1.4-.7 1-1.5-.5-1 .2-2 1.2-2h1.5a2.6 2.6 0 0 0 2.5-2.7C14.2 4.6 11.4 1.8 8 1.8z" />
      <circle cx="5" cy="7" r="0.8" fill="currentColor" />
      <circle cx="7.5" cy="4.6" r="0.8" fill="currentColor" />
      <circle cx="10.6" cy="5.6" r="0.8" fill="currentColor" />
    </svg>
  )
}

function SoundIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 6h2.6L8 3.2v9.6L4.6 10H2z" fill="currentColor" stroke="none" />
      <path d="M10.6 5.6c.9.9.9 3.9 0 4.8M12.6 3.8c1.9 1.9 1.9 6.5 0 8.4" />
    </svg>
  )
}

function SignOutIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2.5H3.5v11H6M10 5l3 3-3 3M13 8H6" />
    </svg>
  )
}
