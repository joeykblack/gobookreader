import { db, getAllBooks, getAllReviews, getAllReviewEvents } from './db.js'
import { isBookImportedLocally, listBookFiles, readBookFileBytes, writeBookFile } from './opfs.js'

const SYNC_STORAGE_KEY = 'gorecall.googleSync.v1'
const SRS_SETTINGS_KEY = 'gorecall.srsSettings.v1'
const READER_STATE_KEY = 'gorecall.readerState.v1'
const SYNC_FILE_NAME = 'gobooks-sync.json'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo'
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata email'

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

const DEFAULT_CLIENT_ID = '382276948946-64im2ov6mnq0vr07gtvih9g0a2ivsmh9.apps.googleusercontent.com'

function defaultSyncState() {
  return { clientId: DEFAULT_CLIENT_ID, accessToken: null, tokenExpiry: 0, email: null, lastSyncedAt: null }
}

function getOAuthRedirectUri() {
  const host = String(window.location.hostname || '').toLowerCase()

  // Local testing commonly authorizes only http://127.0.0.1:<port>/ in Google.
  // Use origin root locally so /docs/ or /index.html paths do not cause mismatch.
  if (host === '127.0.0.1' || host === 'localhost') {
    return `${window.location.origin}/`
  }

  // PWA launches can use /index.html while browser sessions may use /.
  // Normalize both to the app root path to avoid redirect_uri_mismatch.
  const normalizedPath = String(window.location.pathname || '/').replace(/index\.html$/i, '') || '/'
  return `${window.location.origin}${normalizedPath}`
}

export function loadSyncState() {
  try {
    return { ...defaultSyncState(), ...JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) || '{}') }
  } catch {
    return defaultSyncState()
  }
}

export function saveSyncState(state) {
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(state))
}

/** Returns true if the stored token is present and not about to expire. */
export function isTokenValid(state) {
  return !!(state.accessToken && Date.now() < (state.tokenExpiry || 0) - 60_000)
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * Called at app startup. If the URL hash contains an access_token fragment
 * (produced by Google OAuth redirect), extract it and either post it back to
 * the opener window (popup flow) or store it locally (redirect flow).
 *
 * Returns true when this page load is an auth popup that should close itself
 * (init() should be skipped). Returns false in all other cases.
 */
export function checkAuthCallback() {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token')) return false

  const params = new URLSearchParams(hash.slice(1))
  const accessToken = params.get('access_token')
  if (!accessToken) return false

  const expiresIn = parseInt(params.get('expires_in') || '3600', 10)
  const tokenData = { accessToken, tokenExpiry: Date.now() + expiresIn * 1000 }

  // Clean up the hash so the URL looks normal
  history.replaceState(null, '', window.location.pathname + window.location.search)

  if (window.opener && !window.opener.closed) {
    // Popup flow: hand the token to the main window and close
    window.opener.postMessage({ type: 'google-auth-token', token: tokenData }, window.location.origin)
    window.close()
    return true // skip init() in the popup
  }

  // Redirect flow: store and continue; init() will run after this
  const state = loadSyncState()
  state.accessToken = tokenData.accessToken
  state.tokenExpiry = tokenData.tokenExpiry
  saveSyncState(state)
  return false
}

/**
 * Opens a Google sign-in popup and returns a promise that resolves with the
 * token data once the user completes the OAuth flow.
 */
function startGoogleAuth(clientId) {
  const redirectUri = getOAuthRedirectUri()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true'
  })

  return new Promise((resolve, reject) => {
    const popup = window.open(
      `${AUTH_URL}?${params}`,
      'google-auth',
      'width=520,height=640,left=200,top=100'
    )
    if (!popup) {
      reject(new Error('Popup was blocked. Allow popups for this site and try again.'))
      return
    }

    let settled = false
    const settle = (fn, value) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      window.removeEventListener('message', onMessage)
      fn(value)
    }

    const onMessage = event => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'google-auth-token') settle(resolve, event.data.token)
    }
    window.addEventListener('message', onMessage)

    const poll = setInterval(() => {
      if (popup.closed) settle(reject, new Error('Sign-in window was closed before completing.'))
    }, 500)
  })
}

async function getTokenEmail(accessToken) {
  try {
    const resp = await fetch(`${TOKEN_INFO_URL}?access_token=${encodeURIComponent(accessToken)}`)
    if (!resp.ok) return null
    return (await resp.json()).email || null
  } catch {
    return null
  }
}

/** Opens the Google OAuth popup, stores the token + email, and returns the updated state. */
export async function connectGoogle() {
  const state = loadSyncState()
  if (!state.clientId) throw new Error('Google OAuth client ID is not configured.')

  const tokenData = await startGoogleAuth(state.clientId)
  state.accessToken = tokenData.accessToken
  state.tokenExpiry = tokenData.tokenExpiry
  state.email = await getTokenEmail(tokenData.accessToken)
  saveSyncState(state)
  return state
}

/** Clears the stored token and email without touching the Client ID. */
export function disconnectGoogle() {
  const state = loadSyncState()
  state.accessToken = null
  state.tokenExpiry = 0
  state.email = null
  saveSyncState(state)
}

// ---------------------------------------------------------------------------
// Drive API helpers
// ---------------------------------------------------------------------------

async function findSyncFileId(accessToken) {
  const q = encodeURIComponent(`name='${SYNC_FILE_NAME}'`)
  const resp = await fetch(
    `${DRIVE_FILES_URL}?spaces=appDataFolder&fields=files(id)&q=${q}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!resp.ok) throw new Error(`Drive list failed (${resp.status})`)
  const data = await resp.json()
  return data.files?.[0]?.id || null
}

/** Deletes the app sync file from Google Drive appDataFolder. */
export async function clearRemoteSyncData() {
  const state = loadSyncState()
  if (!isTokenValid(state)) {
    throw new Error('Session expired or not signed in. Please reconnect to Google.')
  }

  const token = state.accessToken
  const fileId = await findSyncFileId(token)
  if (!fileId) {
    return { deleted: false }
  }

  const resp = await fetch(`${DRIVE_FILES_URL}/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) {
    throw new Error(`Drive delete failed (${resp.status})`)
  }

  state.lastSyncedAt = null
  saveSyncState(state)
  return { deleted: true }
}

async function downloadFile(accessToken, fileId) {
  const resp = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!resp.ok) throw new Error(`Drive download failed (${resp.status})`)
  return resp.json()
}

async function uploadFile(accessToken, fileId, payload) {
  const body = JSON.stringify(payload)

  if (fileId) {
    // Update existing file
    const resp = await fetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body
    })
    if (!resp.ok) throw new Error(`Drive update failed (${resp.status})`)
    return resp.json()
  }

  // Create new file with multipart upload
  const boundary = 'gobooks_sync_boundary'
  const metadata = JSON.stringify({ name: SYNC_FILE_NAME, parents: ['appDataFolder'] })
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    body,
    `--${boundary}--`
  ].join('\r\n')

  const resp = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipart
  })
  if (!resp.ok) throw new Error(`Drive create failed (${resp.status})`)
  return resp.json()
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

function getLocalBookPositions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READER_STATE_KEY) || '{}')
    const booksMap = parsed.books && typeof parsed.books === 'object' ? parsed.books : {}
    const positions = {}
    for (const [bookId, state] of Object.entries(booksMap)) {
      if (!bookId || !state.chapterFile) continue
      positions[bookId] = {
        chapterFile: state.chapterFile || '',
        sectionName: state.sectionName || '',
        updatedAt: state.updatedAt || ''
      }
    }
    return positions
  } catch {
    return {}
  }
}

async function buildLocalPayload() {
  const [books, sections, reviewEvents] = await Promise.all([
    getAllBooks(),
    getAllReviews(),
    getAllReviewEvents()
  ])

  return {
    books,
    sections,
    // Strip device-specific auto-increment IDs from review events
    reviews: reviewEvents.map(({ id: _id, ...rest }) => rest),
    bookFiles: {},
    srsSettings: JSON.parse(localStorage.getItem(SRS_SETTINGS_KEY) || '{}'),
    bookPositions: getLocalBookPositions(),
    syncedAt: new Date().toISOString()
  }
}

async function snapshotBookFiles(bookId) {
  const imported = await isBookImportedLocally(bookId)
  if (!imported) return []

  const paths = await listBookFiles(bookId)
  if (!paths.length) return []

  const files = []
  for (const path of paths) {
    const bytes = await readBookFileBytes(bookId, path)
    files.push({ path, data: bytesToBase64(bytes) })
  }
  return files
}

function hasLocalChanges(local, remote, bookIdsNeedingUpload) {
  const remoteBooksById = new Map((remote.books || []).map(b => [b.id, b]))
  for (const b of local.books || []) {
    const rb = remoteBooksById.get(b.id)
    if (!rb) return true
    if ((b.importedAt || '') > (rb.importedAt || '')) return true
  }

  const remoteSectionsById = new Map((remote.sections || []).map(s => [s.itemId, s]))
  for (const s of local.sections || []) {
    const rs = remoteSectionsById.get(s.itemId)
    if (!rs) return true
    const localTs = s?.lastReviewedAt || s?.createdAt || ''
    const remoteTs = rs?.lastReviewedAt || rs?.createdAt || ''
    if (localTs > remoteTs) return true
  }

  const remoteReviewKeys = new Set((remote.reviews || []).map(r => `${r.itemId}|${r.reviewedAt}`))
  for (const r of local.reviews || []) {
    if (!remoteReviewKeys.has(`${r.itemId}|${r.reviewedAt}`)) return true
  }

  if ((bookIdsNeedingUpload || []).length) return true

  const remoteSettings = remote.srsSettings || {}
  const localSettings = local.srsSettings || {}
  if (JSON.stringify(remoteSettings) !== JSON.stringify({ ...remoteSettings, ...localSettings })) {
    return true
  }

  const remotePositions = remote.bookPositions || {}
  for (const [bookId, pos] of Object.entries(local.bookPositions || {})) {
    const rp = remotePositions[bookId]
    if (!rp) return true
    if ((pos.updatedAt || '') > (rp.updatedAt || '')) return true
  }

  return false
}

function mergePayloads(local, remote) {
  // Books: union by id; newer importedAt wins
  const booksById = new Map()
  for (const b of [...(remote.books || []), ...(local.books || [])]) {
    const cur = booksById.get(b.id)
    if (!cur || (b.importedAt || '') >= (cur.importedAt || '')) booksById.set(b.id, b)
  }

  // Sections (SRS state): by itemId; newer lastReviewedAt (or createdAt) wins
  const sectionsById = new Map()
  const ts = s => s?.lastReviewedAt || s?.createdAt || ''
  for (const s of [...(remote.sections || []), ...(local.sections || [])]) {
    const cur = sectionsById.get(s.itemId)
    if (!cur || ts(s) >= ts(cur)) sectionsById.set(s.itemId, s)
  }

  // Review events: deduplicate by itemId+reviewedAt fingerprint
  const seen = new Set()
  const mergedReviews = []
  for (const r of [...(remote.reviews || []), ...(local.reviews || [])]) {
    const key = `${r.itemId}|${r.reviewedAt}`
    if (!seen.has(key)) { seen.add(key); mergedReviews.push(r) }
  }

  // SRS settings: local settings take priority over remote
  const srsSettings = { ...(remote.srsSettings || {}), ...(local.srsSettings || {}) }

  // Book files: merge by bookId/path and prefer local bytes on collisions
  const mergedBookFiles = {}
  const allBookIds = new Set([
    ...Object.keys(remote.bookFiles || {}),
    ...Object.keys(local.bookFiles || {})
  ])

  for (const bookId of allBookIds) {
    const byPath = new Map()
    for (const file of remote.bookFiles?.[bookId] || []) {
      if (!file?.path || !file?.data) continue
      byPath.set(file.path, file)
    }
    for (const file of local.bookFiles?.[bookId] || []) {
      if (!file?.path || !file?.data) continue
      byPath.set(file.path, file)
    }
    const files = [...byPath.values()]
    if (files.length) {
      mergedBookFiles[bookId] = files
    }
  }

  // Book reading positions: newest updatedAt wins
  const mergedPositions = {}
  const allPosIds = new Set([
    ...Object.keys(remote.bookPositions || {}),
    ...Object.keys(local.bookPositions || {})
  ])
  for (const bookId of allPosIds) {
    const r = remote.bookPositions?.[bookId]
    const l = local.bookPositions?.[bookId]
    if (!r) { mergedPositions[bookId] = l; continue }
    if (!l) { mergedPositions[bookId] = r; continue }
    mergedPositions[bookId] = (l.updatedAt || '') >= (r.updatedAt || '') ? l : r
  }

  return {
    books: [...booksById.values()],
    sections: [...sectionsById.values()],
    reviews: mergedReviews,
    bookFiles: mergedBookFiles,
    srsSettings,
    bookPositions: mergedPositions,
    syncedAt: new Date().toISOString()
  }
}

async function applyPayload(payload) {
  if (payload.books?.length) {
    await db.books.bulkPut(payload.books)
  }

  if (payload.sections?.length) {
    await db.section.bulkPut(payload.sections)
  }

  if (payload.reviews?.length) {
    const existing = await getAllReviewEvents()
    const existingKeys = new Set(existing.map(r => `${r.itemId}|${r.reviewedAt}`))
    const newEvents = payload.reviews.filter(r => !existingKeys.has(`${r.itemId}|${r.reviewedAt}`))
    if (newEvents.length) await db.review.bulkAdd(newEvents)
  }

  if (payload.srsSettings && Object.keys(payload.srsSettings).length) {
    const current = JSON.parse(localStorage.getItem(SRS_SETTINGS_KEY) || '{}')
    // Local settings already take priority (set via form); only fill in missing keys from remote
    localStorage.setItem(SRS_SETTINGS_KEY, JSON.stringify({ ...payload.srsSettings, ...current }))
  }

  if (payload.bookFiles && typeof payload.bookFiles === 'object') {
    for (const [bookId, files] of Object.entries(payload.bookFiles)) {
      if (!bookId || !Array.isArray(files) || !files.length) continue
      const alreadyLocal = await isBookImportedLocally(bookId)
      if (alreadyLocal) continue
      for (const file of files) {
        if (!file?.path || !file?.data) continue
        await writeBookFile(bookId, file.path, base64ToBytes(file.data))
      }
    }
  }

  if (payload.bookPositions && typeof payload.bookPositions === 'object') {
    try {
      const raw = JSON.parse(localStorage.getItem(READER_STATE_KEY) || '{}')
      const localBooks = raw.books && typeof raw.books === 'object' ? raw.books : {}
      let changed = false
      for (const [bookId, pos] of Object.entries(payload.bookPositions)) {
        if (!bookId || !pos?.chapterFile) continue
        const existing = localBooks[bookId]
        if (!existing || (pos.updatedAt || '') > (existing.updatedAt || '')) {
          localBooks[bookId] = {
            ...(existing || {}),
            chapterFile: pos.chapterFile,
            sectionName: pos.sectionName || '',
            updatedAt: pos.updatedAt || ''
          }
          changed = true
        }
      }
      if (changed) {
        raw.books = localBooks
        localStorage.setItem(READER_STATE_KEY, JSON.stringify(raw))
      }
    } catch {
      // Ignore reader state errors
    }
  }
}

// ---------------------------------------------------------------------------
// Main sync entry point
// ---------------------------------------------------------------------------

/**
 * Performs a full bidirectional sync with Google Drive appdata.
 * Requires a valid token to be stored (call connectGoogle() first).
 * Returns { ok, syncedAt, stats: { books, sections, reviews } }.
 */
export async function syncNow() {
  const state = loadSyncState()
  if (!isTokenValid(state)) {
    throw new Error('Session expired or not signed in. Please reconnect to Google.')
  }

  const token = state.accessToken
  const local = await buildLocalPayload()
  const fileId = await findSyncFileId(token)

  let merged
  let shouldUpload = true
  if (fileId) {
    const remote = await downloadFile(token, fileId)

    const remoteBookFiles = remote.bookFiles || {}
    const bookIdsNeedingUpload = []
    for (const b of local.books || []) {
      if (!b?.id) continue
      const imported = await isBookImportedLocally(b.id)
      if (!imported) continue
      if (!Array.isArray(remoteBookFiles[b.id]) || !remoteBookFiles[b.id].length) {
        bookIdsNeedingUpload.push(b.id)
      }
    }

    if (bookIdsNeedingUpload.length) {
      for (const bookId of bookIdsNeedingUpload) {
        local.bookFiles[bookId] = await snapshotBookFiles(bookId)
      }
    }

    shouldUpload = hasLocalChanges(local, remote, bookIdsNeedingUpload)
    merged = mergePayloads(local, remote)

    if (!shouldUpload) {
      await applyPayload(remote)
      state.lastSyncedAt = remote.syncedAt || new Date().toISOString()
      saveSyncState(state)
      return {
        ok: true,
        syncedAt: state.lastSyncedAt,
        stats: {
          books: remote.books?.length || 0,
          sections: remote.sections?.length || 0,
          reviews: remote.reviews?.length || 0,
          booksWithFiles: Object.keys(remote.bookFiles || {}).length
        }
      }
    }
  } else {
    for (const b of local.books || []) {
      if (!b?.id) continue
      local.bookFiles[b.id] = await snapshotBookFiles(b.id)
    }
    merged = local
  }

  await uploadFile(token, fileId, merged)
  await applyPayload(merged)

  state.lastSyncedAt = merged.syncedAt
  saveSyncState(state)

  return {
    ok: true,
    syncedAt: merged.syncedAt,
    stats: {
      books: merged.books?.length || 0,
      sections: merged.sections?.length || 0,
      reviews: merged.reviews?.length || 0,
      booksWithFiles: Object.keys(merged.bookFiles || {}).length
    }
  }
}
