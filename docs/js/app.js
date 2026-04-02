import {
  getAllBooks,
  getAllReviews,
  getReviewsForChapter,
  upsertBook,
  deleteBook,
  upsertReview,
  getReview,
  deleteReview,
  deleteAllReviews,
  deleteReviewsForBook
} from './db.js'
import { importEpubFile } from './epub.js'
import { isOpfsSupported, deleteBookFiles } from './opfs.js'
import { createReaderController } from './reader.js'
import { createReviewItem, applySm2Rating } from './srs.js'

const swStatusEl = document.getElementById('sw-status')
const appStatusEl = document.getElementById('app-status')
const importInputEl = document.getElementById('epub-file')
const importButtonEl = document.getElementById('import-button')
const booksListEl = document.getElementById('books-list')
const readerRootEl = document.getElementById('reader-panel')
const appMainTitleEl = document.getElementById('app-main-title')
const appSubtitleEl = document.getElementById('app-subtitle')
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
const menuAboutEl = document.getElementById('menu-about')
const importView = document.getElementById('import-view')
const bookshelfView = document.getElementById('bookshelf-view')
const queueView = document.getElementById('queue-view')
const queueEmptyView = document.getElementById('queue-empty-view')
const infoView = document.getElementById('info-view')
const statsView = document.getElementById('stats-view')
const aboutView = document.getElementById('about-view')
const reviewTodayStatsEl = document.getElementById('review-today-stats')
const statsTodayEl = document.getElementById('stats-today')
const statsKpisEl = document.getElementById('stats-kpis')
const statsHistoryEl = document.getElementById('stats-history')
const reviewEmptyTextEl = document.getElementById('review-empty-text')
const reviewQueueSummaryEl = document.getElementById('review-queue-summary')
const readerFooterControlsEl = document.getElementById('reader-footer-controls')
const clearAllReviewsBtn = document.getElementById('clear-all-reviews')
const aboutVersionEl = document.getElementById('about-version')

const READER_STATE_KEY = 'gorecall.readerState.v1'

function loadReaderState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READER_STATE_KEY) || '{}')
    return {
      selectedBookId: parsed.selectedBookId || null,
      activeView: parsed.activeView || 'library',
      books: parsed.books && typeof parsed.books === 'object' ? parsed.books : {}
    }
  } catch {
    return { selectedBookId: null, activeView: 'library', books: {} }
  }
}

let readerState = loadReaderState()

function saveReaderState() {
  localStorage.setItem(READER_STATE_KEY, JSON.stringify(readerState))
}

function ensureBookState(bookId) {
  if (!bookId) return null
  if (!readerState.books[bookId]) {
    readerState.books[bookId] = { chapterFile: '', sectionName: '' }
  }
  return readerState.books[bookId]
}

function setSelectedBookId(bookId) {
  readerState.selectedBookId = bookId || null
  saveReaderState()
}

function setBookChapter(bookId, chapterFile) {
  const state = ensureBookState(bookId)
  if (!state) return
  state.chapterFile = chapterFile || ''
  state.sectionName = ''
  saveReaderState()
}

function setBookSection(bookId, sectionName) {
  const state = ensureBookState(bookId)
  if (!state) return
  state.sectionName = sectionName || ''
  saveReaderState()
}

function getBookState(bookId) {
  return readerState.books[bookId] || { chapterFile: '', sectionName: '' }
}

let books = []
let selectedBookId = readerState.selectedBookId
let currentReviewItem = null  // Track which item from queue is being reviewed
let activeView = readerState.activeView || 'library'
let detachSectionTracker = null

const menuItemsByView = {
  read: menuReadEl,
  queue: menuReviewEl,
  library: menuLibraryEl,
  import: menuImportEl,
  info: menuInfoEl,
  stats: menuStatsEl,
  about: menuAboutEl
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
    return
  }

  const location = reader.getCurrentLocation()
  const currentBook = location ? books.find(b => b.id === location.bookId) : null

  if (activeView === 'queue') {
    appMainTitleEl.textContent = `Reviewing: ${currentBook?.title || 'Unknown book'}`
    const todayStr = localDateStr()
    const allReviews = await getAllReviews()
    const reviewedToday = allReviews.filter(r => isSameLocalDate(r.lastReviewedAt, todayStr)).length
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

const reader = createReaderController({
  rootEl: readerRootEl,
  titleEl: readerTitleEl,
  selectEl: readerChapterSelectEl,
  pageIndicatorEl: readerPageIndicatorEl,
  prevButtonEl: readerPrevButtonEl,
  nextButtonEl: readerNextButtonEl,
  contentsButtonEl: readerContentsButtonEl,
  frameEl: readerFrameEl,
  statusCallback: setStatus,
  reviewStateProvider: getChapterReviewStates,
  onLocationChange: ({ bookId, chapterFile }) => {
    selectedBookId = bookId
    setSelectedBookId(bookId)
    setBookChapter(bookId, chapterFile)
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

function renderBooks() {
  booksListEl.innerHTML = ''

  if (!books.length) {
    const li = document.createElement('li')
    li.textContent = 'No books imported yet.'
    booksListEl.append(li)
    return
  }

  for (const book of books) {
    const li = document.createElement('li')
    li.style.display = 'flex'
    li.style.alignItems = 'center'
    li.style.gap = '0.5rem'
    li.style.marginBottom = '0.35rem'

    const selectBtn = document.createElement('button')
    selectBtn.type = 'button'
    selectBtn.textContent = `${book.title} (${book.author})`
    selectBtn.addEventListener('click', async () => {
      selectedBookId = book.id
      setSelectedBookId(book.id)
      switchView('read')
      await openBookAtSavedPosition(book)
    })

    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.textContent = '🗑'
    deleteBtn.title = `Delete "${book.title}"`
    deleteBtn.className = 'btn-danger'
    deleteBtn.addEventListener('click', () => deleteSelectedBook(book))

    li.append(selectBtn, deleteBtn)
    booksListEl.append(li)
  }

  const selected = books.find(book => book.id === selectedBookId) || books[0]
  selectedBookId = selected.id
  setSelectedBookId(selectedBookId)
}

async function openBookAtSavedPosition(book) {
  const persisted = getBookState(book.id)
  const chapterIndex = book.chapters.findIndex(ch => ch.href === persisted.chapterFile)
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
      const location = reader.getCurrentLocation()
      if (!location) return
      const sectionName = findCurrentSectionName(iframeDoc)
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

  const book = books.find(b => b.id === selectedBookId) || books[0]
  if (!book) return

  selectedBookId = book.id
  setSelectedBookId(book.id)
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

  if (rating === 'Mark') {
    await upsertReview({
      ...review,
      lastRating: 'Mark'
    })
    setStatus(`Marked "${sectionName}" for review. Due ${review.dueDate}.`, 'ok')
  } else {
    const updated = applySm2Rating(review, rating, new Date())
    await upsertReview(updated)
    setStatus(
      `${rating}: "${sectionName}" — due ${updated.dueDate} | ${updated.intervalDays}d | EF ${updated.easeFactor}`,
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
  { key: 'overdue',  label: 'Overdue',   color: '#ef4444' },
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
  if (diff < 0) text = 'Overdue'
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

  const chapterIndex = book.chapters.findIndex(ch => ch.href === review.chapterFile)
  if (chapterIndex < 0) { setStatus('Chapter not found.', 'warn'); return }

  currentReviewItem = review
  selectedBookId = book.id
  setSelectedBookId(book.id)
  if (activeView !== targetView) {
    switchView(targetView)
  }
  await reader.openBook(book, chapterIndex)
  scrollIframeToSection(review.sectionName)
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

  const newToday = allReviews.filter(r => isSameLocalDate(r.createdAt, todayStr)).length
  const reviewedToday = allReviews.filter(r => isSameLocalDate(r.lastReviewedAt, todayStr)).length
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
  const today = new Date()
  const todayStr = localDateStr(today)

  const newToday = allReviews.filter(r => isSameLocalDate(r.createdAt, todayStr)).length
  const reviewedToday = allReviews.filter(r => isSameLocalDate(r.lastReviewedAt, todayStr)).length
  statsTodayEl.textContent = `Today: ${newToday} new · ${reviewedToday} reviewed`

  const last7Start = localDateStr(addDays(today, -6))
  const new7 = allReviews.filter(r => r.createdAt && localDateStr(new Date(r.createdAt)) >= last7Start).length
  const reviewed7 = allReviews.filter(r => r.lastReviewedAt && localDateStr(new Date(r.lastReviewedAt)) >= last7Start).length

  const last30Start = localDateStr(addDays(today, -29))
  const new30 = allReviews.filter(r => r.createdAt && localDateStr(new Date(r.createdAt)) >= last30Start).length
  const reviewed30 = allReviews.filter(r => r.lastReviewedAt && localDateStr(new Date(r.lastReviewedAt)) >= last30Start).length

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
    const reviewed = review.lastReviewedAt ? localDateStr(new Date(review.lastReviewedAt)) : ''
    if (map.has(created)) map.get(created).new += 1
    if (map.has(reviewed)) map.get(reviewed).reviewed += 1
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
  aboutView.style.display = view === 'about' ? '' : 'none'
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
  updateTopHeader()
}

async function openCurrentBookForRead() {
  if (reader.isOpen()) {
    switchView('read')
    return
  }

  const book = books.find(b => b.id === selectedBookId) || books[0]
  if (!book) {
    switchView('library')
    setStatus('No book is currently open.', 'warn')
    return
  }

  selectedBookId = book.id
  setSelectedBookId(book.id)
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

async function importSelectedEpub() {
  const file = importInputEl.files?.[0]
  if (!file) {
    setStatus('Choose an EPUB file first.', 'warn')
    return
  }

  importButtonEl.disabled = true
  setStatus('Importing EPUB…')

  try {
    const book = await importEpubFile(file, msg => setStatus(msg))
    await upsertBook(book)
    selectedBookId = book.id
    setSelectedBookId(book.id)
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
    setStatus('Ready. Import an EPUB and open a chapter to read.')
  }

  importButtonEl.addEventListener('click', importSelectedEpub)
  menuToggleEl.addEventListener('click', toggleMenu)
  menuBackdropEl.addEventListener('click', closeMenu)
  menuReadEl.addEventListener('click', async () => {
    closeMenu()
    await openCurrentBookForRead()
  })
  menuReviewEl.addEventListener('click', () => {
    closeMenu()
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
  menuAboutEl.addEventListener('click', () => {
    closeMenu()
    switchView('about')
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
  attachSectionTracking()
  await loadAppVersion()
  await refreshBooks()
  switchView(activeView)

  if (activeView === 'read') {
    await restoreLastReadingPosition()
  }
}

init()
