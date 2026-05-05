import {
  getAllBooks,
  getAllReviews,
  getReviewsForChapter,
  upsertBook,
  deleteBook,
  upsertReview,
  addReviewEvent,
  getReview,
  deleteReview,
  deleteAllReviews,
  deleteReviewsForBook,
  getAllReviewEvents,
  addHighlight,
  deleteHighlight,
  getHighlightsForChapter,
  deleteHighlightsForBook
} from './db.js'
import { importEpubFile } from './epub.js'
import { importPdfFile } from './pdf.js'
import { isOpfsSupported, deleteBookFiles, isBookImportedLocally } from './opfs.js'
import { createReaderController } from './reader.js'
import { createReviewItem } from './srs.js'
import { applyFsrsRating, getDefaultFsrsSettings } from './fsrs.js'
import { checkAuthCallback, loadSyncState, saveSyncState, isTokenValid, connectGoogle, disconnectGoogle, syncNow } from './sync.js'

const swStatusEl = document.getElementById('sw-status')
const appStatusEl = document.getElementById('app-status')
const syncBannerEl = document.getElementById('sync-banner')
const importInputEl = document.getElementById('epub-file')
const importButtonEl = document.getElementById('import-button')
const booksListEl = document.getElementById('books-list')
const sortTitleEl = document.getElementById('sort-title')
const sortAuthorEl = document.getElementById('sort-author')
const sortPublicationDateEl = document.getElementById('sort-publicationDate')
const sortImportedAtEl = document.getElementById('sort-importedAt')
const readerRootEl = document.getElementById('reader-panel')
const appMainTitleEl = document.getElementById('app-main-title')
const appSubtitleEl = document.getElementById('app-subtitle')
const pdfZoomControlsEl = document.getElementById('pdf-zoom-controls')
const pdfZoomOutEl = document.getElementById('pdf-zoom-out')
const pdfZoomInEl = document.getElementById('pdf-zoom-in')
const pdfZoomLabelEl = document.getElementById('pdf-zoom-label')
const readerTitleEl = document.getElementById('reader-title')
const readerChapterSelectEl = document.getElementById('reader-chapter-select')
const readerPageIndicatorEl = document.getElementById('reader-page-indicator')
const readerPrevButtonEl = document.getElementById('reader-prev')
const readerNextButtonEl = document.getElementById('reader-next')
const readerContentsButtonEl = document.getElementById('reader-contents')
const readerNextReviewButtonEl = document.getElementById('reader-next-review')
const readerFrameEl = document.getElementById('reader-frame')
const appHeaderEl = document.getElementById('app-header')
const appFooterEl = document.getElementById('app-footer')
const menuToggleEl = document.getElementById('menu-toggle')
const menuBackdropEl = document.getElementById('menu-backdrop')
const appMenuEl = document.getElementById('app-menu')
const menuReadEl = document.getElementById('menu-read')
const menuReviewEl = document.getElementById('menu-review')
const menuLibraryEl = document.getElementById('menu-library')
const menuImportEl = document.getElementById('menu-import')
const menuInfoEl = document.getElementById('menu-info')
const menuStatsEl = document.getElementById('menu-stats')
const menuSettingsEl = document.getElementById('menu-settings')
const menuAboutEl = document.getElementById('menu-about')
const menuSyncEl = document.getElementById('menu-sync')
const importView = document.getElementById('import-view')
const bookshelfView = document.getElementById('bookshelf-view')
const queueView = document.getElementById('queue-view')
const queueEmptyView = document.getElementById('queue-empty-view')
const infoView = document.getElementById('info-view')
const statsView = document.getElementById('stats-view')
const settingsView = document.getElementById('settings-view')
const aboutView = document.getElementById('about-view')
const syncView = document.getElementById('sync-view')
const syncBodyEl = document.getElementById('sync-body')
const reviewTodayStatsEl = document.getElementById('review-today-stats')
const statsTodayEl = document.getElementById('stats-today')
const statsKpisEl = document.getElementById('stats-kpis')
const statsHistoryEl = document.getElementById('stats-history')
const reviewEmptyTextEl = document.getElementById('review-empty-text')
const reviewQueueSummaryEl = document.getElementById('review-queue-summary')
const readerFooterControlsEl = document.getElementById('reader-footer-controls')
const clearAllReviewsBtn = document.getElementById('clear-all-reviews')
const aboutVersionEl = document.getElementById('about-version')
const settingsFormEl = document.getElementById('settings-form')
const readerThemeEl = document.getElementById('reader-theme')
const fsrsSettingsEl = document.getElementById('fsrs-settings')
const fsrsRetentionEl = document.getElementById('fsrs-retention')
const fsrsMaxIntervalEl = document.getElementById('fsrs-max-interval')
const fsrsEnableFuzzEl = document.getElementById('fsrs-enable-fuzz')
const fsrsEnableShortEl = document.getElementById('fsrs-enable-short')
const fsrsLearningStepsEl = document.getElementById('fsrs-learning-steps')
const fsrsRelearningStepsEl = document.getElementById('fsrs-relearning-steps')
const srsPreviewEl = document.getElementById('srs-preview')

const READER_STATE_KEY = 'gorecall.readerState.v1'
const SRS_SETTINGS_KEY = 'gorecall.srsSettings.v1'
const PDF_ZOOM_MIN = 0.6
const PDF_ZOOM_MAX = 2.4
const PDF_ZOOM_STEP = 0.05

function normalizeReaderTheme(value) {
  const theme = String(value || '').trim().toLowerCase()
  if (theme === 'sepia' || theme === 'dim-sepia') return theme
  return 'sepia'
}

function defaultSrsSettings() {
  return {
    fsrs: getDefaultFsrsSettings()
  }
}

function loadSrsSettings() {
  const defaults = defaultSrsSettings()
  try {
    const parsed = JSON.parse(localStorage.getItem(SRS_SETTINGS_KEY) || '{}')
    return {
      fsrs: { ...defaults.fsrs, ...(parsed.fsrs || {}) }
    }
  } catch {
    return defaults
  }
}

let srsSettings = loadSrsSettings()

function saveSrsSettings() {
  localStorage.setItem(SRS_SETTINGS_KEY, JSON.stringify(srsSettings))
}

function toStepsInput(value) {
  return Array.isArray(value) ? value.join(', ') : ''
}

function parseStepsInput(value, fallback = []) {
  const raw = String(value || '').trim()
  if (!raw) return [...fallback]
  const items = raw.split(',').map(v => v.trim()).filter(Boolean)
  return items.length ? items : [...fallback]
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatMs(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60)
  const minutes = totalMinutes - days * 60 * 24 - hours * 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatDueFrom(reviewedAt, dueDate) {
  const reviewed = new Date(reviewedAt)
  const due = parseDueDateTime(dueDate)
  if (!due) return 'unknown'
  return formatMs(due.getTime() - reviewed.getTime())
}

async function applyRatingWithSettings(review, rating, reviewedAt, settings) {
  return applyFsrsRating(review, rating, reviewedAt, settings.fsrs)
}

let srsPreviewRun = 0

async function renderSrsPreview(settingsOverride = null) {
  if (!srsPreviewEl) return
  const run = ++srsPreviewRun
  const settings = settingsOverride || readSettingsForm()
  const ratings = ['Again', 'Hard', 'Good', 'Easy']
  const now = new Date()

  srsPreviewEl.textContent = 'Calculating preview…'

  try {
    const root = createReviewItem({
      itemId: '__preview__',
      bookId: '__preview__',
      chapterFile: '__preview__.xhtml',
      sectionName: 'Preview item',
      positionOffset: 0
    })

    const branches = []
    for (const firstRating of ratings) {
      const first = await applyRatingWithSettings(root, firstRating, now, settings)
      const firstDue = parseDueDateTime(first.dueDate) || now
      const firstText = `${firstRating} → due in ${formatDueFrom(now, first.dueDate)} (${new Date(first.dueDate).toLocaleString()})`

      const secondBranches = []
      for (const secondRating of ratings) {
        const second = await applyRatingWithSettings(first, secondRating, firstDue, settings)
        const secondText = `${secondRating} next → due in ${formatDueFrom(firstDue, second.dueDate)} (${new Date(second.dueDate).toLocaleString()})`
        secondBranches.push(`<li>${escapeHtml(secondText)}</li>`)
      }

      branches.push(`<li><div>${escapeHtml(firstText)}</div><ul class="preview-tree">${secondBranches.join('')}</ul></li>`)
    }

    if (run !== srsPreviewRun) return
    srsPreviewEl.innerHTML = `<ul class="preview-tree">${branches.join('')}</ul>`
  } catch (err) {
    if (run !== srsPreviewRun) return
    srsPreviewEl.textContent = `Unable to calculate preview: ${err.message}`
  }
}

function setNumericInputValue(el, value) {
  if (!el) return
  el.value = Number.isFinite(Number(value)) ? String(value) : ''
}

function renderSettingsForm() {
  if (!settingsFormEl) return

  if (readerThemeEl) {
    readerThemeEl.value = normalizeReaderTheme(readerState.readerTheme)
  }

  setNumericInputValue(fsrsRetentionEl, srsSettings.fsrs.request_retention)
  setNumericInputValue(fsrsMaxIntervalEl, srsSettings.fsrs.maximum_interval)
  fsrsEnableFuzzEl.value = srsSettings.fsrs.enable_fuzz ? 'true' : 'false'
  fsrsEnableShortEl.value = srsSettings.fsrs.enable_short_term ? 'true' : 'false'
  fsrsLearningStepsEl.value = toStepsInput(srsSettings.fsrs.learning_steps)
  fsrsRelearningStepsEl.value = toStepsInput(srsSettings.fsrs.relearning_steps)

  if (fsrsSettingsEl) fsrsSettingsEl.style.display = ''
}

function readSettingsForm() {
  const defaults = defaultSrsSettings()

  return {
    fsrs: {
      request_retention: Number(fsrsRetentionEl.value || defaults.fsrs.request_retention),
      maximum_interval: Number(fsrsMaxIntervalEl.value || defaults.fsrs.maximum_interval),
      enable_fuzz: fsrsEnableFuzzEl.value === 'true',
      enable_short_term: fsrsEnableShortEl.value === 'true',
      learning_steps: parseStepsInput(fsrsLearningStepsEl.value, defaults.fsrs.learning_steps),
      relearning_steps: parseStepsInput(fsrsRelearningStepsEl.value, defaults.fsrs.relearning_steps),
    }
  }
}

function loadReaderState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READER_STATE_KEY) || '{}')
    return {
      selectedBookId: parsed.selectedBookId || null,
      lastReadBookId: parsed.lastReadBookId || null,
      activeView: parsed.activeView || 'library',
      readerTheme: normalizeReaderTheme(parsed.readerTheme),
      books: parsed.books && typeof parsed.books === 'object' ? parsed.books : {}
    }
  } catch {
    return { selectedBookId: null, lastReadBookId: null, activeView: 'library', readerTheme: 'sepia', books: {} }
  }
}

function normalizePdfZoom(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 1
  return Math.max(PDF_ZOOM_MIN, Math.min(PDF_ZOOM_MAX, Number(num.toFixed(2))))
}

let readerState = loadReaderState()

function saveReaderState() {
  localStorage.setItem(READER_STATE_KEY, JSON.stringify(readerState))
}

function ensureBookState(bookId) {
  if (!bookId) return null
  if (!readerState.books[bookId]) {
    readerState.books[bookId] = { chapterFile: '', sectionName: '', pdfZoom: 1 }
  }
  if (!Number.isFinite(Number(readerState.books[bookId].pdfZoom))) {
    readerState.books[bookId].pdfZoom = 1
  }
  return readerState.books[bookId]
}

function setSelectedBookId(bookId) {
  readerState.selectedBookId = bookId || null
  saveReaderState()
}

function setLastReadBookId(bookId) {
  readerState.lastReadBookId = bookId || null
  saveReaderState()
}

function setBookChapter(bookId, chapterFile) {
  const state = ensureBookState(bookId)
  if (!state) return
  state.chapterFile = chapterFile || ''
  state.sectionName = ''
  state.updatedAt = new Date().toISOString()
  saveReaderState()
}

function setBookSection(bookId, sectionName) {
  const state = ensureBookState(bookId)
  if (!state) return
  state.sectionName = sectionName || ''
  state.updatedAt = new Date().toISOString()
  saveReaderState()
}

function setReaderTheme(theme) {
  readerState.readerTheme = normalizeReaderTheme(theme)
  saveReaderState()
}

function getBookPdfZoom(bookId) {
  const state = ensureBookState(bookId)
  return normalizePdfZoom(state?.pdfZoom)
}

function setBookPdfZoom(bookId, zoom) {
  const state = ensureBookState(bookId)
  if (!state) return 1
  state.pdfZoom = normalizePdfZoom(zoom)
  saveReaderState()
  return state.pdfZoom
}

function getBookState(bookId) {
  return readerState.books[bookId] || { chapterFile: '', sectionName: '' }
}

let books = []
let selectedBookId = readerState.selectedBookId
let booksSort = { key: 'title', direction: 'asc' }
let currentReviewItem = null  // Track which item from queue is being reviewed
let activeView = readerState.activeView || 'library'
let detachSectionTracker = null
let autoSyncTimer = null
let autoSyncInFlight = false
let autoSyncQueued = false

function cancelBackgroundSync() {
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer)
    autoSyncTimer = null
  }
  autoSyncQueued = false
}

function showSyncBanner(msg = 'Syncing\u2026') {
  if (!syncBannerEl) return
  syncBannerEl.textContent = msg
  syncBannerEl.hidden = false
}

function hideSyncBanner() {
  if (!syncBannerEl) return
  syncBannerEl.hidden = true
  syncBannerEl.textContent = ''
}

/**
 * Foreground startup sync: shows a banner, runs a full sync, and updates
 * readerState from the synced localStorage. The caller is responsible for
 * restoring the reading position AFTER this resolves so the book opens at
 * the synced chapter rather than the stale local one.
 */
async function startupSync() {
  const syncState = loadSyncState()
  if (syncState.autoSyncEnabled === false) return
  if (!syncState.email) return

  showSyncBanner('Syncing\u2026')
  try {
    await syncNow({ interactiveFallback: false })
    readerState = loadReaderState()
    await refreshBooks()
  } catch (err) {
    console.warn('[startupSync] sync failed:', err)
  }
  hideSyncBanner()
}

function scheduleBackgroundSync(delayMs = 1800) {
  const syncState = loadSyncState()
  if (syncState.autoSyncEnabled === false) return
  if (!syncState.accessToken && !syncState.email) return

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer)
  }

  autoSyncTimer = setTimeout(async () => {
    autoSyncTimer = null

    if (autoSyncInFlight) {
      autoSyncQueued = true
      return
    }

    autoSyncInFlight = true
    try {
      await syncNow({ interactiveFallback: false })
      readerState = loadReaderState()
    } catch {
      // Keep background sync silent; manual Sync handles user-visible errors.
    } finally {
      autoSyncInFlight = false
      if (autoSyncQueued) {
        autoSyncQueued = false
        scheduleBackgroundSync(2500)
      }
    }
  }, Math.max(250, delayMs))
}

const menuItemsByView = {
  read: menuReadEl,
  queue: menuReviewEl,
  library: menuLibraryEl,
  import: menuImportEl,
  info: menuInfoEl,
  stats: menuStatsEl,
  settings: menuSettingsEl,
  about: menuAboutEl,
  sync: menuSyncEl
}

async function loadAppVersion() {
  try {
    const response = await fetch('./sw.js', { cache: 'no-store' })
    const text = await response.text()
    const match = text.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/) 
    aboutVersionEl.textContent = `Version: ${match?.[1] || 'unknown'}`
  } catch {
    aboutVersionEl.textContent = 'Version: unavailable'
  }
}

function closeMenu() {
  appMenuEl.hidden = true
  menuBackdropEl.hidden = true
  menuToggleEl.setAttribute('aria-expanded', 'false')
}

function openMenu() {
  appMenuEl.hidden = false
  menuBackdropEl.hidden = false
  menuToggleEl.setAttribute('aria-expanded', 'true')
}

function toggleMenu() {
  if (appMenuEl.hidden) openMenu()
  else closeMenu()
}

async function updateTopHeader() {
  if (activeView !== 'read' && activeView !== 'queue') {
    appMainTitleEl.textContent = 'GoBooks Reader'
    appSubtitleEl.textContent = ''
    if (pdfZoomControlsEl) pdfZoomControlsEl.hidden = true
    return
  }

  const location = reader.getCurrentLocation()
  const currentBook = location ? books.find(b => b.id === location.bookId) : null
  const isPdfOpen = isPdfBook(currentBook)

  if (pdfZoomControlsEl && pdfZoomLabelEl && pdfZoomOutEl && pdfZoomInEl) {
    if (isPdfOpen) {
      const zoom = getBookPdfZoom(currentBook.id)
      pdfZoomControlsEl.hidden = false
      pdfZoomLabelEl.textContent = `${Math.round(zoom * 100)}%`
      pdfZoomOutEl.disabled = zoom <= PDF_ZOOM_MIN + 0.001
      pdfZoomInEl.disabled = zoom >= PDF_ZOOM_MAX - 0.001
    } else {
      pdfZoomControlsEl.hidden = true
    }
  }

  if (activeView === 'queue') {
    appMainTitleEl.textContent = `Reviewing: ${currentBook?.title || 'Unknown book'}`
    const todayStr = localDateStr()
    const reviewEvents = await getAllReviewEvents()
    const reviewedCountsByDay = buildReviewedSectionCountsByDay(reviewEvents)
    const reviewedToday = reviewedCountsByDay.get(todayStr) || 0
    appSubtitleEl.textContent = `Reviewed today: ${reviewedToday}`
    return
  }

  if (currentBook) {
    appMainTitleEl.textContent = currentBook.title
  } else {
    appMainTitleEl.textContent = 'GoBooks Reader'
  }

  const todayStr = localDateStr()
  const allReviews = await getAllReviews()
  const sectionsToday = allReviews.filter(r => isSameLocalDate(r.createdAt, todayStr)).length
  appSubtitleEl.textContent = `Sections Today: ${sectionsToday}`
}

function updateLayoutMetrics() {
  const root = document.documentElement
  const viewportHeight = Number(window.visualViewport?.height || window.innerHeight || 0)
  const viewportTop = Number(window.visualViewport?.offsetTop || 0)
  const viewportBottom = viewportTop + viewportHeight
  const topHeight = Number(appHeaderEl?.getBoundingClientRect().height || 0)
  const bottomHeight = Number(appFooterEl?.getBoundingClientRect().height || 0)
  const headerBottom = Number(appHeaderEl?.getBoundingClientRect().bottom || 0)
  const footerTop = Number(appFooterEl?.getBoundingClientRect().top || 0)
  const readerTop = Math.max(0, headerBottom)
  const readerHeight = Math.max(0, footerTop - readerTop)
  const readerBottomOffset = Math.max(0, viewportBottom - footerTop)

  if (viewportHeight > 0) {
    root.style.setProperty('--app-height', `${viewportHeight.toFixed(2)}px`)
  }
  root.style.setProperty('--viewport-top', `${viewportTop.toFixed(2)}px`)
  if (topHeight > 0) {
    root.style.setProperty('--top-bar-height', `${topHeight.toFixed(2)}px`)
  }
  if (bottomHeight > 0) {
    root.style.setProperty('--bottom-bar-height', `${bottomHeight.toFixed(2)}px`)
  }
  root.style.setProperty('--reader-top', `${readerTop.toFixed(2)}px`)
  root.style.setProperty('--reader-height', `${readerHeight.toFixed(2)}px`)
  root.style.setProperty('--reader-bottom', `${readerBottomOffset.toFixed(2)}px`)

  // Force exact reader fit between fixed bars using measured pixels.
  // This avoids Android viewport rounding drift that can leave a visible bottom gap.
  if (readerRootEl) {
    readerRootEl.style.top = `${readerTop.toFixed(2)}px`
    readerRootEl.style.bottom = `${readerBottomOffset.toFixed(2)}px`
    readerRootEl.style.height = 'auto'
  }
}

async function getChapterReviewStates(bookId, chapterFile) {
  const reviews = await getReviewsForChapter(bookId, chapterFile)
  const states = new Map()

  for (const review of reviews) {
    const stored = review.lastRating || (!review.lastReviewedAt ? 'Mark' : '')
    if (review.sectionName && stored) {
      states.set(review.sectionName, stored)
    }
  }

  return states
}

async function getChapterHighlights(bookId, chapterFile) {
  return getHighlightsForChapter(bookId, chapterFile)
}

const reader = createReaderController({
  rootEl: readerRootEl,
  titleEl: readerTitleEl,
  selectEl: readerChapterSelectEl,
  pageIndicatorEl: readerPageIndicatorEl,
  prevButtonEl: readerPrevButtonEl,
  nextButtonEl: readerNextButtonEl,
  contentsButtonEl: readerContentsButtonEl,
  frameEl: readerFrameEl,
  getTheme: () => readerState.readerTheme,
  statusCallback: setStatus,
  reviewStateProvider: getChapterReviewStates,
  highlightProvider: getChapterHighlights,
  onLocationChange: ({ bookId, chapterFile }) => {
    selectedBookId = bookId
    setSelectedBookId(bookId)
    if (activeView === 'read') {
      setLastReadBookId(bookId)
      setBookChapter(bookId, chapterFile)
      scheduleBackgroundSync()
    }
    updateTopHeader()
  }
})

function setStatus(message, kind = '') {
  appStatusEl.textContent = message
  appStatusEl.className = kind
}

function splitUrlAndHash(url) {
  const idx = String(url || '').indexOf('#')
  if (idx < 0) return { path: String(url || ''), hash: '' }
  return {
    path: String(url || '').slice(0, idx),
    hash: String(url || '').slice(idx)
  }
}

function getChapterIndexForHref(book, href) {
  const { path } = splitUrlAndHash(href)
  return book.chapters.findIndex(ch => ch.href === path)
}

function isPdfBook(book) {
  return String(book?.format || '').toLowerCase() === 'pdf'
}

function getPdfSectionFromChapterFile(chapterFile) {
  const match = String(chapterFile || '').match(/^pdf-page-(\d+)$/i)
  if (!match) return ''
  return `Page ${Number(match[1])}`
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    swStatusEl.textContent = 'Service worker: not supported in this browser.'
    swStatusEl.className = 'warn'
    return
  }

  try {
    const registration = await navigator.serviceWorker.register('./sw.js')
    swStatusEl.textContent = `Service worker: registered (${registration.scope})`
    swStatusEl.className = 'ok'
  } catch (err) {
    swStatusEl.textContent = `Service worker: registration failed (${err.message})`
    swStatusEl.className = 'warn'
  }
}

async function renderBooks() {
  booksListEl.innerHTML = ''
  updateSortHeaderIndicators()

  if (!books.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.colSpan = 5
    cell.textContent = 'No books imported yet.'
    row.append(cell)
    booksListEl.append(row)
    return
  }

  const sortedBooks = [...books].sort((a, b) => compareBooks(a, b, booksSort))

  // Check OPFS availability for all books in parallel
  const localFlags = await Promise.all(sortedBooks.map(b => isBookImportedLocally(b.id)))

  for (let i = 0; i < sortedBooks.length; i++) {
    const book = sortedBooks[i]
    const isLocal = localFlags[i]
    const row = document.createElement('tr')

    const selectBtn = document.createElement('button')
    selectBtn.type = 'button'
    selectBtn.className = 'book-btn'
    selectBtn.disabled = !isLocal
    selectBtn.title = isLocal ? book.title : 'Import this file on this device to read it'
    if (isLocal) {
      selectBtn.textContent = book.title
    } else {
      selectBtn.textContent = book.title
      const badge = document.createElement('span')
      badge.textContent = ' ⬇ not imported'
      badge.style.cssText = 'font-size:0.75rem;color:#9ca3af;margin-left:0.35rem;font-weight:400;'
      selectBtn.append(badge)
    }
    selectBtn.addEventListener('click', async () => {
      selectedBookId = book.id
      setSelectedBookId(book.id)
      setLastReadBookId(book.id)
      switchView('read')
      await openBookAtSavedPosition(book)
    })

    const titleCell = document.createElement('td')
    titleCell.append(selectBtn)

    const authorCell = document.createElement('td')
    authorCell.textContent = book.author || 'Unknown'

    const publicationCell = document.createElement('td')
    publicationCell.textContent = formatDateCell(book.publicationDate)

    const importCell = document.createElement('td')
    importCell.textContent = formatDateCell(book.importedAt)

    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.textContent = '🗑'
    deleteBtn.title = `Delete "${book.title}"`
    deleteBtn.className = 'btn-danger'
    deleteBtn.addEventListener('click', () => deleteSelectedBook(book))

    const actionCell = document.createElement('td')
    actionCell.append(deleteBtn)

    row.append(titleCell, authorCell, publicationCell, importCell, actionCell)
    booksListEl.append(row)
  }

  const selected = books.find(book => book.id === selectedBookId) || books[0]
  selectedBookId = selected.id
  setSelectedBookId(selectedBookId)
}

function formatDateCell(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString()
}

function getSortValue(book, key) {
  if (key === 'title' || key === 'author') {
    return String(book[key] || '').toLowerCase()
  }

  if (key === 'publicationDate' || key === 'importedAt') {
    const time = new Date(book[key] || '').getTime()
    return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
  }

  return String(book?.[key] || '').toLowerCase()
}

function compareBooks(a, b, sort) {
  const av = getSortValue(a, sort.key)
  const bv = getSortValue(b, sort.key)
  let result = 0
  if (av < bv) result = -1
  else if (av > bv) result = 1

  if (result === 0) {
    result = String(a.title || '').localeCompare(String(b.title || ''))
  }

  return sort.direction === 'asc' ? result : -result
}

function setBooksSort(key) {
  if (booksSort.key === key) {
    booksSort.direction = booksSort.direction === 'asc' ? 'desc' : 'asc'
  } else {
    booksSort = {
      key,
      direction: key === 'importedAt' ? 'desc' : 'asc'
    }
  }
  renderBooks()
}

function updateSortHeaderIndicators() {
  const headers = {
    title: sortTitleEl,
    author: sortAuthorEl,
    publicationDate: sortPublicationDateEl,
    importedAt: sortImportedAtEl
  }

  for (const [key, el] of Object.entries(headers)) {
    if (!el) continue
    const active = booksSort.key === key
    el.classList.toggle('active', active)
    const arrow = active ? (booksSort.direction === 'asc' ? ' ↑' : ' ↓') : ''
    const base = key === 'publicationDate'
      ? 'Publication date'
      : key === 'importedAt'
        ? 'Import date'
        : key === 'author'
          ? 'Author'
          : 'Title'
    el.textContent = `${base}${arrow}`
  }
}

async function openBookAtSavedPosition(book) {
  const imported = await isBookImportedLocally(book.id)
  if (!imported) {
    setStatus(`"${book.title}" has not been imported on this device. Go to Import and load the file.`, 'warn')
    return
  }
  const persisted = getBookState(book.id)
  const chapterIndex = book.chapters.findIndex(ch => ch.href === persisted.chapterFile)
  reader.setPdfZoom(isPdfBook(book) ? getBookPdfZoom(book.id) : 1, { rerender: false })
  await reader.openBook(book, chapterIndex >= 0 ? chapterIndex : 0)

  if (persisted.sectionName) {
    await scrollIframeToSection(persisted.sectionName)
  }
}

function findCurrentSectionName(iframeDoc) {
  const headings = Array.from(iframeDoc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter(h => (h.textContent || '').trim())

  if (!headings.length) return ''

  const offset = 96
  let current = headings[0]

  for (const h of headings) {
    const top = h.getBoundingClientRect().top
    if (top - offset <= 0) {
      current = h
    } else {
      break
    }
  }

  return (current.textContent || '').trim()
}

function attachSectionTracking() {
  readerFrameEl.addEventListener('load', () => {
    if (detachSectionTracker) {
      detachSectionTracker()
      detachSectionTracker = null
    }

    const iframeDoc = readerFrameEl.contentDocument || readerFrameEl.contentWindow?.document
    const iframeWin = readerFrameEl.contentWindow
    if (!iframeDoc || !iframeWin) return

    let timer = null
    const persistVisibleSection = () => {
      if (activeView !== 'read') return
      const location = reader.getCurrentLocation()
      if (!location) return
      setLastReadBookId(location.bookId)
      const currentBook = books.find(b => b.id === location.bookId)
      const sectionName = isPdfBook(currentBook)
        ? getPdfSectionFromChapterFile(location.chapterFile)
        : findCurrentSectionName(iframeDoc)
      setBookSection(location.bookId, sectionName)
    }

    const onScroll = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        persistVisibleSection()
      }, 120)
    }

    iframeWin.addEventListener('scroll', onScroll, { passive: true })

    const initTimer = setTimeout(() => {
      persistVisibleSection()
    }, 140)

    detachSectionTracker = () => {
      iframeWin.removeEventListener('scroll', onScroll)
      if (timer) clearTimeout(timer)
      clearTimeout(initTimer)
    }
  })
}

async function restoreLastReadingPosition() {
  if (!books.length) return

  const preferredBookId = readerState.lastReadBookId || selectedBookId
  const book = books.find(b => b.id === preferredBookId) || books[0]
  if (!book) return

  selectedBookId = book.id
  setSelectedBookId(book.id)
  setLastReadBookId(book.id)
  await openBookAtSavedPosition(book)
}

async function deleteSelectedBook(book) {
  if (!confirm(`Delete "${book.title}"?\n\nThis will remove the book and all its files. This cannot be undone.`)) {
    return
  }

  setStatus(`Deleting "${book.title}"…`)

  try {
    if (reader.isOpen(book.id)) {
      reader.closeReader()
    }

    await deleteBookFiles(book.id)
    await deleteReviewsForBook(book.id)
    await deleteBook(book.id)

    if (selectedBookId === book.id) {
      selectedBookId = null
      setSelectedBookId(null)
    }

    await refreshBooks()
    setStatus(`Deleted: ${book.title}`, 'ok')
  } catch (err) {
    setStatus(`Delete failed: ${err.message}`, 'warn')
  }
}

function makeItemId(bookId, chapterFile, sectionName) {
  return `${bookId}::${chapterFile}::${sectionName}`
}

function cloneReviewState(review) {
  return review ? JSON.parse(JSON.stringify(review)) : null
}

async function logReviewEvent({
  itemId,
  bookId,
  chapterFile,
  sectionName,
  rating,
  reviewedAt,
  before,
  after
}) {
  await addReviewEvent({
    itemId,
    bookId,
    chapterFile,
    sectionName,
    reviewedAt: new Date(reviewedAt).toISOString(),
    rating: String(rating),
    scheduler: 'fsrs',
    dueDateBefore: before?.dueDate || null,
    dueDateAfter: after?.dueDate || null,
    intervalDaysBefore: Number(before?.intervalDays ?? 0),
    intervalDaysAfter: Number(after?.intervalDays ?? 0),
    repetitionsBefore: Number(before?.repetitions ?? 0),
    repetitionsAfter: Number(after?.repetitions ?? 0),
    lapsesBefore: Number(before?.lapses ?? 0),
    lapsesAfter: Number(after?.lapses ?? 0),
    easeFactorBefore: Number(before?.easeFactor ?? 0),
    easeFactorAfter: Number(after?.easeFactor ?? 0),
    fsrsCardBefore: before?.fsrsCard || null,
    fsrsCardAfter: after?.fsrsCard || null,
    settingsSnapshot: cloneReviewState(srsSettings.fsrs),
    stateBefore: cloneReviewState(before),
    stateAfter: cloneReviewState(after)
  })
}

async function handleSrsMessage(event) {
  if (!event.data || event.data.type !== 'srs') return

  const { sectionName, rating } = event.data
  if (!sectionName || !rating) return

  const location = reader.getCurrentLocation()
  if (!location) {
    setStatus('No chapter open for SRS action.', 'warn')
    return
  }

  const itemId = makeItemId(location.bookId, location.chapterFile, sectionName)
  let review = await getReview(itemId)

  if (!review) {
    review = createReviewItem({
      itemId,
      bookId: location.bookId,
      chapterFile: location.chapterFile,
      sectionName,
      positionOffset: 0
    })
  }

  review = {
    ...review,
    scheduler: 'fsrs'
  }

  const before = cloneReviewState(review)

  if (rating === 'Mark') {
    const updated = {
      ...review,
      lastRating: 'Mark'
    }
    await upsertReview(updated)
    await logReviewEvent({
      itemId,
      bookId: location.bookId,
      chapterFile: location.chapterFile,
      sectionName,
      rating,
      reviewedAt: new Date(),
      before,
      after: updated
    })
    setStatus(`Marked "${sectionName}" for review. Due ${review.dueDate}.`, 'ok')
  } else {
    const now = new Date()
    const updated = {
      ...(await applyFsrsRating(review, rating, now, srsSettings.fsrs)),
      scheduler: 'fsrs'
    }
    await upsertReview(updated)
    await logReviewEvent({
      itemId,
      bookId: location.bookId,
      chapterFile: location.chapterFile,
      sectionName,
      rating,
      reviewedAt: now,
      before,
      after: updated
    })
    setStatus(
      `FSRS ${rating}: "${sectionName}" — due ${updated.dueDate} | ${updated.intervalDays}d`,
      'ok'
    )
  }

  // Refresh whichever view is active
  if (currentReviewItem && currentReviewItem.itemId === itemId) {
    if (activeView === 'queue') await renderReviewQueue()
    if (activeView === 'info') await renderReviewInfo()
    if (activeView === 'stats') await renderStatsView()
  }

  if (activeView === 'read' || activeView === 'queue') {
    await updateTopHeader()
  }

  scheduleBackgroundSync()
}

async function handleHighlightMessage(event) {
  const { type } = event.data || {}

  if (type === 'add-highlight') {
    const { text, prefix, suffix } = event.data
    if (!text || !text.trim()) return
    const location = reader.getCurrentLocation()
    if (!location) return
    await addHighlight({
      bookId: location.bookId,
      chapterFile: location.chapterFile,
      text,
      prefix: prefix || '',
      suffix: suffix || ''
    })
    await reader.reloadCurrentChapter()
    scheduleBackgroundSync()
  } else if (type === 'remove-highlight') {
    const { id } = event.data
    if (!id && id !== 0) return
    await deleteHighlight(id)
    await reader.reloadCurrentChapter()
    scheduleBackgroundSync()
  }
}

async function refreshBooks() {
  books = await getAllBooks()
  renderBooks()
}

function localDateStr(dateLike = new Date()) {
  const d = new Date(dateLike)
  d.setHours(0, 0, 0, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDueDateTime(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) return parsed

  const asDateOnly = new Date(`${value}T00:00:00`)
  if (!Number.isNaN(asDateOnly.getTime())) return asDateOnly

  return null
}

function toDueSortValue(value) {
  const d = parseDueDateTime(value)
  return d ? d.getTime() : Number.POSITIVE_INFINITY
}

const BUCKETS = [
  { key: 'overdue',  label: 'Ready',     color: '#ef4444' },
  { key: 'today',    label: 'Today',      color: '#f97316' },
  { key: 'tomorrow', label: 'Tomorrow',   color: '#facc15' },
  { key: 'week',     label: 'This week',  color: '#60a5fa' },
  { key: 'later',    label: 'Later',      color: '#4ade80' },
]

function daysDiff(dueDateStr, todayStr) {
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const due = parseDueDateTime(dueDateStr)
  if (!due) return 9999

  const dueStart = new Date(due)
  dueStart.setHours(0, 0, 0, 0)
  return Math.round((dueStart - new Date(ty, tm - 1, td)) / 86400000)
}

function getBucket(dueDateStr, todayStr) {
  const diff = daysDiff(dueDateStr, todayStr)
  if (diff < 0) return BUCKETS[0]
  if (diff === 0) return BUCKETS[1]
  if (diff === 1) return BUCKETS[2]
  if (diff <= 6) return BUCKETS[3]
  return BUCKETS[4]
}

function dueBadgeInfo(dueDateStr, todayStr) {
  const diff = daysDiff(dueDateStr, todayStr)
  const bucket = getBucket(dueDateStr, todayStr)
  let text
  if (diff < 0) text = 'Ready'
  else if (diff === 0) text = 'Today'
  else if (diff === 1) text = 'Tomorrow'
  else if (diff <= 6) text = `In ${diff} days`
  else text = localDateStr(parseDueDateTime(dueDateStr) || new Date())
  return { text, cssClass: 'due-' + bucket.key }
}

function formatDueDateTime(value) {
  const due = parseDueDateTime(value)
  if (!due) return 'Unknown'
  return due.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function isSameLocalDate(isoString, todayStr) {
  if (!isoString) return false
  return localDateStr(new Date(isoString)) === todayStr
}

function buildReviewedSectionCountsByDay(reviewEvents = []) {
  const firstInteractionAtByItem = new Map()
  const countedItemDayKeys = new Set()
  const countsByDay = new Map()

  const sortedEvents = [...reviewEvents]
    .filter(event => event?.itemId && event?.reviewedAt)
    .sort((a, b) => new Date(a.reviewedAt) - new Date(b.reviewedAt))

  for (const event of sortedEvents) {
    const itemId = String(event.itemId)
    const reviewedAtMs = new Date(event.reviewedAt).getTime()
    if (!Number.isFinite(reviewedAtMs)) continue

    if (!firstInteractionAtByItem.has(itemId)) {
      firstInteractionAtByItem.set(itemId, reviewedAtMs)
      continue
    }

    if (String(event.rating || '') === 'Mark') continue
    if (reviewedAtMs <= firstInteractionAtByItem.get(itemId)) continue

    const day = localDateStr(new Date(reviewedAtMs))
    const itemDayKey = `${itemId}::${day}`
    if (countedItemDayKeys.has(itemDayKey)) continue

    countedItemDayKeys.add(itemDayKey)
    countsByDay.set(day, (countsByDay.get(day) || 0) + 1)
  }

  return countsByDay
}

async function getDueReviews() {
  const now = Date.now()
  const allReviews = await getAllReviews()
  return allReviews
    .filter(review => toDueSortValue(review.dueDate) <= now)
    .sort((a, b) => (
      toDueSortValue(a.dueDate) - toDueSortValue(b.dueDate) ||
      a.bookId.localeCompare(b.bookId) ||
      a.chapterFile.localeCompare(b.chapterFile) ||
      a.sectionName.localeCompare(b.sectionName)
    ))
}

async function openReviewItem(review, targetView = 'read') {
  const book = books.find(b => b.id === review.bookId)
  if (!book) { setStatus('Book not found.', 'warn'); return }

  const imported = await isBookImportedLocally(book.id)
  if (!imported) {
    setStatus(`"${book.title}" is not imported on this device yet. Import the file to review it.`, 'warn')
    return
  }

  const chapterIndex = book.chapters.findIndex(ch => ch.href === review.chapterFile)
  if (chapterIndex < 0) { setStatus('Chapter not found.', 'warn'); return }

  currentReviewItem = review
  selectedBookId = book.id
  setSelectedBookId(book.id)
  if (activeView !== targetView) {
    switchView(targetView)
  }
  reader.setPdfZoom(isPdfBook(book) ? getBookPdfZoom(book.id) : 1, { rerender: false })
  await reader.openBook(book, chapterIndex)
  if (!isPdfBook(book)) {
    scrollIframeToSection(review.sectionName)
  }
  setStatus(`Reviewing: "${review.sectionName}" from ${book.title}`, 'ok')
}

async function goToNextReview() {
  const dueItems = await getDueReviews()

  if (!dueItems.length) {
    currentReviewItem = null
    if (activeView === 'queue') {
      reader.setViewVisible(false)
      reviewQueueSummaryEl.textContent = 'No items due today. Great work!'
    }
    setStatus('No items due today. Great work!', 'ok')
    updateNextReviewButton([])
    return
  }

  const currentIdx = currentReviewItem
    ? dueItems.findIndex(item => item.itemId === currentReviewItem.itemId)
    : -1

  const nextItem = dueItems[(currentIdx + 1 + dueItems.length) % dueItems.length]
  await openReviewItem(nextItem, 'queue')
  await renderReviewQueue()
}

function updateNextReviewButton(dueItems = null) {
  const visible = activeView === 'queue'
  readerNextReviewButtonEl.style.display = visible ? '' : 'none'

  const items = Array.isArray(dueItems) ? dueItems : []
  readerNextReviewButtonEl.disabled = !visible || items.length === 0
  updateLayoutMetrics()
}

/**
 * Render the review queue: all reviews with dueDate <= today (local date).
 */
async function renderReviewQueue() {
  const dueItems = await getDueReviews()

  if (!dueItems.length) {
    reviewQueueSummaryEl.textContent = 'No items due today. Great work!'
    queueEmptyView.style.display = activeView === 'queue' ? '' : 'none'
    if (activeView === 'queue') {
      currentReviewItem = null
      reader.setViewVisible(false)
      reviewEmptyTextEl.textContent = 'No items due today. Great work!'
    }
    updateNextReviewButton(dueItems)
    return
  }

  queueEmptyView.style.display = 'none'
  const currentIdx = currentReviewItem
    ? dueItems.findIndex(item => item.itemId === currentReviewItem.itemId)
    : -1
  const activeItem = currentIdx >= 0 ? dueItems[currentIdx] : dueItems[0]
  const activeNumber = Math.max(0, currentIdx) + 1 || 1
  reviewQueueSummaryEl.textContent = `Reviewing ${activeNumber} of ${dueItems.length}`

  if (activeView === 'queue') {
    reader.setViewVisible(true)
    if (!currentReviewItem || currentReviewItem.itemId !== activeItem.itemId) {
      await openReviewItem(activeItem, 'queue')
    }
  }

  updateNextReviewButton(dueItems)
}

/**
 * Render the review info view: bar chart of all items by due bucket + full list.
 */
async function renderReviewInfo() {
  const todayStr = localDateStr()
  const allReviews = await getAllReviews()
  const reviewEvents = await getAllReviewEvents()
  const reviewedCountsByDay = buildReviewedSectionCountsByDay(reviewEvents)

  const newToday = allReviews.filter(r => isSameLocalDate(r.createdAt, todayStr)).length
  const reviewedToday = reviewedCountsByDay.get(todayStr) || 0
  if (reviewTodayStatsEl) {
    reviewTodayStatsEl.textContent = `Today: ${newToday} new · ${reviewedToday} reviewed`
  }

  // --- Chart ---
  const reviewChartEl = document.getElementById('review-chart')
  reviewChartEl.innerHTML = ''

  const counts = Object.fromEntries(BUCKETS.map(b => [b.key, 0]))
  for (const r of allReviews) counts[getBucket(r.dueDate, todayStr).key]++

  const maxCount = Math.max(1, ...Object.values(counts))

  for (const bucket of BUCKETS) {
    const count = counts[bucket.key]
    const heightPct = Math.round((count / maxCount) * 100)

    const col = document.createElement('div')
    col.className = 'chart-col'

    const countEl = document.createElement('div')
    countEl.className = 'chart-count'
    countEl.textContent = count

    const barArea = document.createElement('div')
    barArea.className = 'chart-bar-area'

    const bar = document.createElement('div')
    bar.className = 'chart-bar'
    bar.style.height = `${heightPct}%`
    bar.style.background = bucket.color
    if (count === 0) bar.style.opacity = '0.2'

    barArea.appendChild(bar)

    const label = document.createElement('div')
    label.className = 'chart-label'
    label.textContent = bucket.label

    col.append(countEl, barArea, label)
    reviewChartEl.appendChild(col)
  }

  // --- List ---
  const infoListEl = document.getElementById('review-info-list')
  infoListEl.innerHTML = ''

  if (!allReviews.length) {
    const li = document.createElement('li')
    li.textContent = 'No review items yet.'
    li.style.padding = '1rem'
    li.style.textAlign = 'center'
    li.style.color = '#9ca3af'
    infoListEl.append(li)
    return
  }

  allReviews.sort((a, b) => toDueSortValue(a.dueDate) - toDueSortValue(b.dueDate))

  for (const review of allReviews) {
    const li = document.createElement('li')
    li.className = 'info-item'

    const body = document.createElement('div')
    body.className = 'info-item-body'
    body.addEventListener('click', () => openReviewItem(review))

    const sectionEl = document.createElement('div')
    sectionEl.className = 'info-item-section'
    sectionEl.textContent = review.sectionName

    const metaEl = document.createElement('div')
    metaEl.className = 'info-item-meta'
    const book = books.find(b => b.id === review.bookId)
    metaEl.textContent = `${book ? book.title : 'Unknown book'} • Due ${formatDueDateTime(review.dueDate)}`

    body.append(sectionEl, metaEl)

    const badge = document.createElement('span')
    badge.className = 'due-badge'
    const { text: badgeText, cssClass } = dueBadgeInfo(review.dueDate, todayStr)
    badge.textContent = badgeText
    badge.classList.add(cssClass)

    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.textContent = '🗑'
    removeBtn.title = 'Remove from review'
    removeBtn.className = 'btn-danger'
    removeBtn.style.flexShrink = '0'
    removeBtn.addEventListener('click', async () => {
      await deleteReview(review.itemId)
      await renderReviewInfo()
    })

    li.append(body, badge, removeBtn)
    infoListEl.append(li)
  }
}

function addDays(dateLike, days) {
  const d = new Date(dateLike)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

function shortDate(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-')
  return `${m}/${d}`
}

async function renderStatsView() {
  const allReviews = await getAllReviews()
  const reviewEvents = await getAllReviewEvents()
  const reviewedCountsByDay = buildReviewedSectionCountsByDay(reviewEvents)
  const today = new Date()
  const todayStr = localDateStr(today)

  const newToday = allReviews.filter(r => isSameLocalDate(r.createdAt, todayStr)).length
  const reviewedToday = reviewedCountsByDay.get(todayStr) || 0
  statsTodayEl.textContent = `Today: ${newToday} new · ${reviewedToday} reviewed`

  const last7Start = localDateStr(addDays(today, -6))
  const new7 = allReviews.filter(r => r.createdAt && localDateStr(new Date(r.createdAt)) >= last7Start).length
  const reviewed7 = Array.from(reviewedCountsByDay.entries())
    .filter(([day]) => day >= last7Start)
    .reduce((sum, [, count]) => sum + count, 0)

  const last30Start = localDateStr(addDays(today, -29))
  const new30 = allReviews.filter(r => r.createdAt && localDateStr(new Date(r.createdAt)) >= last30Start).length
  const reviewed30 = Array.from(reviewedCountsByDay.entries())
    .filter(([day]) => day >= last30Start)
    .reduce((sum, [, count]) => sum + count, 0)

  statsKpisEl.innerHTML = ''
  const kpis = [
    { label: 'Last 7 days', value: `${new7} new · ${reviewed7} reviewed` },
    { label: 'Last 30 days', value: `${new30} new · ${reviewed30} reviewed` },
    { label: 'Total items', value: `${allReviews.length}` }
  ]

  for (const kpi of kpis) {
    const card = document.createElement('div')
    card.className = 'kpi-card'

    const label = document.createElement('div')
    label.className = 'kpi-label'
    label.textContent = kpi.label

    const value = document.createElement('div')
    value.className = 'kpi-value'
    value.textContent = kpi.value

    card.append(label, value)
    statsKpisEl.append(card)
  }

  const days = []
  for (let i = 13; i >= 0; i--) {
    days.push(localDateStr(addDays(today, -i)))
  }

  const map = new Map(days.map(d => [d, { new: 0, reviewed: 0 }]))

  for (const review of allReviews) {
    const created = review.createdAt ? localDateStr(new Date(review.createdAt)) : ''
    if (map.has(created)) map.get(created).new += 1
  }

  for (const [day, count] of reviewedCountsByDay.entries()) {
    if (map.has(day)) map.get(day).reviewed += count
  }

  const maxCount = Math.max(1, ...days.map(d => Math.max(map.get(d).new, map.get(d).reviewed)))

  statsHistoryEl.innerHTML = ''
  for (const day of days) {
    const row = document.createElement('div')
    row.className = 'stats-row'

    const dateEl = document.createElement('div')
    dateEl.className = 'stats-date'
    dateEl.textContent = shortDate(day)

    const bars = document.createElement('div')
    bars.className = 'stats-bars'

    const newBar = document.createElement('div')
    newBar.className = 'stats-bar new'
    newBar.style.width = `${Math.max(2, Math.round((map.get(day).new / maxCount) * 100))}%`
    newBar.style.opacity = map.get(day).new ? '1' : '0.25'

    const reviewedBar = document.createElement('div')
    reviewedBar.className = 'stats-bar reviewed'
    reviewedBar.style.width = `${Math.max(2, Math.round((map.get(day).reviewed / maxCount) * 100))}%`
    reviewedBar.style.opacity = map.get(day).reviewed ? '1' : '0.25'

    bars.append(newBar, reviewedBar)

    const counts = document.createElement('div')
    counts.className = 'stats-counts'
    counts.textContent = `${map.get(day).new} / ${map.get(day).reviewed}`

    row.append(dateEl, bars, counts)
    statsHistoryEl.append(row)
  }
}

function setSyncMsg(text, isError = false) {
  const el = syncBodyEl.querySelector('#sync-msg')
  if (!el) return
  el.textContent = text
  el.style.display = text ? '' : 'none'
  el.style.color = isError ? '#f87171' : ''
}

function renderSyncView() {
  const state = loadSyncState()
  const tokenValid = isTokenValid(state)
  const connected = !!(state.email || state.accessToken)

  syncBodyEl.innerHTML = ''

  const privacy = document.createElement('div')
  privacy.className = 'settings-help'
  privacy.style.marginBottom = '0.9rem'
  privacy.innerHTML = [
    'Your sync data is stored in your own Google Drive app data folder (hidden from normal Drive views).',
    'This app only requests <code>drive.appdata</code> scope and cannot access other files in your Drive.',
    'Only sync books you own across your own devices. ',
    'gobooks.com trusts users to use books for personal use only.'
  ].join('<br><br>')
  syncBodyEl.append(privacy)

  const hr = document.createElement('hr')
  hr.className = 'settings-divider'
  syncBodyEl.append(hr)

  const infoP = document.createElement('p')
  infoP.className = 'settings-help'
  infoP.style.marginBottom = '0.7rem'
  if (connected && state.email && tokenValid) {
    infoP.textContent = `Connected as ${state.email}`
  } else if (connected && state.email) {
    infoP.textContent = `Connected as ${state.email} (session will refresh on sync)`
  } else if (connected) {
    infoP.textContent = tokenValid
      ? 'Connected to Google Drive.'
      : 'Connected to Google Drive (session will refresh on sync).'
  } else {
    infoP.textContent = 'Not connected to Google Drive.'
  }
  syncBodyEl.append(infoP)

  if (connected && state.lastSyncedAt) {
    const lastP = document.createElement('p')
    lastP.className = 'settings-help'
    lastP.style.marginBottom = '0.7rem'
    lastP.textContent = `Last synced: ${new Date(state.lastSyncedAt).toLocaleString()}`
    syncBodyEl.append(lastP)
  }

  const autoSyncWrap = document.createElement('label')
  autoSyncWrap.className = 'settings-help'
  autoSyncWrap.style.display = 'flex'
  autoSyncWrap.style.alignItems = 'center'
  autoSyncWrap.style.gap = '0.45rem'
  autoSyncWrap.style.marginBottom = '0.7rem'

  const autoSyncInput = document.createElement('input')
  autoSyncInput.type = 'checkbox'
  autoSyncInput.checked = state.autoSyncEnabled !== false

  const autoSyncText = document.createElement('span')
  autoSyncText.textContent = 'Auto sync in background (after reviews and page changes) '
  const betaBadge = document.createElement('span')
  betaBadge.textContent = 'Beta'
  betaBadge.style.cssText = 'font-size:0.7em;font-weight:600;background:#1a6fb5;color:#fff;border-radius:3px;padding:1px 5px;vertical-align:middle;letter-spacing:0.03em'
  autoSyncText.append(betaBadge)

  autoSyncInput.addEventListener('change', () => {
    const next = loadSyncState()
    next.autoSyncEnabled = !!autoSyncInput.checked
    saveSyncState(next)

    if (next.autoSyncEnabled) {
      scheduleBackgroundSync(1200)
    } else {
      cancelBackgroundSync()
    }
  })

  autoSyncWrap.append(autoSyncInput, autoSyncText)
  syncBodyEl.append(autoSyncWrap)

  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.7rem;'

  if (connected) {
    const syncBtn = document.createElement('button')
    syncBtn.type = 'button'
    syncBtn.textContent = 'Sync Now'
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true
      setSyncMsg('Syncing…')
      try {
        const result = await syncNow()
        readerState = loadReaderState()
        renderSyncView()
        setSyncMsg(
          `Synced — ${result.stats.books} books, ${result.stats.sections} sections, ${result.stats.reviews} review events.`
        )
        await refreshBooks()
      } catch (err) {
        syncBtn.disabled = false
        setSyncMsg(`Sync failed: ${err.message}`, true)
      }
    })

    const discBtn = document.createElement('button')
    discBtn.type = 'button'
    discBtn.className = 'btn-danger'
    discBtn.textContent = 'Disconnect'
    discBtn.addEventListener('click', () => {
      disconnectGoogle()
      cancelBackgroundSync()
      renderSyncView()
    })

    actions.append(syncBtn, discBtn)
  } else {
    const connectBtn = document.createElement('button')
    connectBtn.type = 'button'
    connectBtn.textContent = 'Connect to Google'
    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true
      setSyncMsg('Opening sign-in window…')
      try {
        await connectGoogle()
        renderSyncView()
      } catch (err) {
        connectBtn.disabled = false
        setSyncMsg(`Sign-in failed: ${err.message}`, true)
      }
    })

    actions.append(connectBtn)
  }

  syncBodyEl.append(actions)

  // --- Status message area ---
  const msgP = document.createElement('p')
  msgP.id = 'sync-msg'
  msgP.className = 'settings-help'
  msgP.style.display = 'none'
  syncBodyEl.append(msgP)
}

function switchView(view) {
  activeView = view
  readerState.activeView = view
  saveReaderState()
  document.body.classList.toggle('review-mode', view === 'queue')
  importView.style.display = view === 'import' ? '' : 'none'
  bookshelfView.style.display = view === 'library' ? '' : 'none'
  queueView.style.display = 'none'
  queueEmptyView.style.display = 'none'
  infoView.style.display = view === 'info' ? '' : 'none'
  statsView.style.display = view === 'stats' ? '' : 'none'
  settingsView.style.display = view === 'settings' ? '' : 'none'
  aboutView.style.display = view === 'about' ? '' : 'none'
  syncView.style.display = view === 'sync' ? '' : 'none'
  reader.setViewVisible(view === 'read' || view === 'queue')
  readerFooterControlsEl.style.display = view === 'read' || view === 'queue' ? '' : 'none'
  reviewQueueSummaryEl.style.display = view === 'queue' ? '' : 'none'

  if (view !== 'queue') {
    reviewQueueSummaryEl.textContent = ''
  }

  for (const [menuView, el] of Object.entries(menuItemsByView)) {
    el.classList.toggle('active', menuView === view)
  }

  updateNextReviewButton([])
  updateLayoutMetrics()
  if (view === 'queue') renderReviewQueue()
  if (view === 'info') renderReviewInfo()
  if (view === 'stats') renderStatsView()
  if (view === 'settings') {
    renderSettingsForm()
    renderSrsPreview()
  }
  if (view === 'sync') renderSyncView()
  updateTopHeader()
}

async function openCurrentBookForRead() {
  const preferredBookId = readerState.lastReadBookId || selectedBookId
  const book = books.find(b => b.id === preferredBookId) || books[0]
  if (!book) {
    switchView('library')
    setStatus('No book is currently open.', 'warn')
    return
  }

  const imported = await isBookImportedLocally(book.id)
  if (!imported) {
    switchView('library')
    setStatus(`"${book.title}" hasn't been imported on this device yet. Use Import to load the file.`, 'warn')
    return
  }

  selectedBookId = book.id
  setSelectedBookId(book.id)
  setLastReadBookId(book.id)
  switchView('read')
  await openBookAtSavedPosition(book)
}

/**
 * Scroll the chapter iframe to the first heading matching the section name.
 * Waits briefly for iframe content to load.
 */
async function scrollIframeToSection(sectionName) {
  // Wait a tick for iframe to load
  await new Promise(resolve => setTimeout(resolve, 100))

  try {
    const iframeDoc = readerFrameEl.contentDocument || readerFrameEl.contentWindow?.document
    if (!iframeDoc) return

    // Find all heading levels.
    const headings = Array.from(iframeDoc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    const targetHeading = headings.find(h => h.textContent.trim() === sectionName.trim())

    if (targetHeading) {
      targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  } catch (err) {
    // Cross-origin or other iframe access issues; silently fail
  }
}

async function importSelectedFile() {
  const file = importInputEl.files?.[0]
  if (!file) {
    setStatus('Choose an EPUB or PDF file first.', 'warn')
    return
  }

  const name = String(file.name || '').toLowerCase()
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf'
  const isEpub = name.endsWith('.epub') || file.type === 'application/epub+zip'
  if (!isPdf && !isEpub) {
    setStatus('Unsupported file type. Please import an EPUB or PDF.', 'warn')
    return
  }

  importButtonEl.disabled = true
  setStatus(isPdf ? 'Importing PDF…' : 'Importing EPUB…')

  try {
    const book = isPdf
      ? await importPdfFile(file, msg => setStatus(msg))
      : await importEpubFile(file, msg => setStatus(msg))
    await upsertBook(book)
    selectedBookId = book.id
    setSelectedBookId(book.id)
    setLastReadBookId(book.id)
    await refreshBooks()
    switchView('read')
    await openBookAtSavedPosition(book)
    setStatus(`Imported: ${book.title}`, 'ok')
  } catch (err) {
    setStatus(`Import failed: ${err.message}`, 'warn')
  } finally {
    importButtonEl.disabled = false
  }
}

async function init() {
  await registerServiceWorker()

  updateLayoutMetrics()
  window.addEventListener('resize', updateLayoutMetrics)
  window.visualViewport?.addEventListener('resize', updateLayoutMetrics)

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => updateLayoutMetrics())
    if (appHeaderEl) observer.observe(appHeaderEl)
    if (appFooterEl) observer.observe(appFooterEl)
  }

  if (!isOpfsSupported()) {
    setStatus('OPFS is not supported in this browser. Use a Chromium-based browser.', 'warn')
  } else {
    setStatus('Ready. Import an EPUB or PDF and start reading.')
  }

  importButtonEl.addEventListener('click', importSelectedFile)
  pdfZoomOutEl?.addEventListener('click', () => {
    const location = reader.getCurrentLocation()
    if (!location) return
    const book = books.find(b => b.id === location.bookId)
    if (!isPdfBook(book)) return
    const next = setBookPdfZoom(book.id, getBookPdfZoom(book.id) - PDF_ZOOM_STEP)
    reader.setPdfZoom(next)
    updateTopHeader()
  })
  pdfZoomInEl?.addEventListener('click', () => {
    const location = reader.getCurrentLocation()
    if (!location) return
    const book = books.find(b => b.id === location.bookId)
    if (!isPdfBook(book)) return
    const next = setBookPdfZoom(book.id, getBookPdfZoom(book.id) + PDF_ZOOM_STEP)
    reader.setPdfZoom(next)
    updateTopHeader()
  })
  sortTitleEl?.addEventListener('click', () => setBooksSort('title'))
  sortAuthorEl?.addEventListener('click', () => setBooksSort('author'))
  sortPublicationDateEl?.addEventListener('click', () => setBooksSort('publicationDate'))
  sortImportedAtEl?.addEventListener('click', () => setBooksSort('importedAt'))
  menuToggleEl.addEventListener('click', toggleMenu)
  menuBackdropEl.addEventListener('click', closeMenu)
  menuReadEl.addEventListener('click', async () => {
    closeMenu()
    await openCurrentBookForRead()
  })
  menuReviewEl.addEventListener('click', () => {
    closeMenu()
    currentReviewItem = null
    switchView('queue')
  })
  menuLibraryEl.addEventListener('click', () => {
    closeMenu()
    switchView('library')
  })
  menuImportEl.addEventListener('click', () => {
    closeMenu()
    switchView('import')
  })
  menuInfoEl.addEventListener('click', () => {
    closeMenu()
    switchView('info')
  })
  menuStatsEl.addEventListener('click', () => {
    closeMenu()
    switchView('stats')
  })
  menuSettingsEl.addEventListener('click', () => {
    closeMenu()
    switchView('settings')
  })
  menuAboutEl.addEventListener('click', () => {
    closeMenu()
    switchView('about')
  })
  menuSyncEl.addEventListener('click', () => {
    closeMenu()
    switchView('sync')
  })
  settingsFormEl.addEventListener('input', () => {
    if (readerThemeEl) {
      const chosenTheme = normalizeReaderTheme(readerThemeEl.value)
      if (chosenTheme !== readerState.readerTheme) {
        setReaderTheme(chosenTheme)
        reader.setTheme(chosenTheme)
      }
    }
    if (activeView === 'settings') {
      renderSrsPreview()
    }
  })
  settingsFormEl.addEventListener('submit', event => {
    event.preventDefault()
    if (readerThemeEl) {
      const chosenTheme = normalizeReaderTheme(readerThemeEl.value)
      setReaderTheme(chosenTheme)
      reader.setTheme(chosenTheme)
    }
    srsSettings = readSettingsForm()
    saveSrsSettings()
    renderSettingsForm()
    renderSrsPreview(srsSettings)
    setStatus('Saved FSRS settings.', 'ok')
  })
  readerNextReviewButtonEl.addEventListener('click', goToNextReview)
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeMenu()
    }
  })
  clearAllReviewsBtn.addEventListener('click', async () => {
    if (!confirm('Remove all review items? This cannot be undone.')) return
    await deleteAllReviews()
    await renderReviewInfo()
    setStatus('All review items cleared.', 'ok')
  })
  window.addEventListener('message', handleSrsMessage)
  window.addEventListener('message', handleHighlightMessage)
  attachSectionTracking()
  await loadAppVersion()
  await refreshBooks()
  renderSettingsForm()
  renderSrsPreview(srsSettings)
  switchView(activeView)

  if (activeView === 'read') {
    // Sync first so restoreLastReadingPosition() uses the up-to-date chapter.
    // Awaiting here prevents onLocationChange from stamping a stale updatedAt
    // before the remote position has been merged into localStorage.
    await startupSync()
    await restoreLastReadingPosition()
  } else {
    // For non-read views sync in the background; readerState will be current
    // by the time the user navigates to the reader.
    setTimeout(() => startupSync(), 0)
  }
}

if (!checkAuthCallback()) {
  init()
}
