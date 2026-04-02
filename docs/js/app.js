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
const menuAboutEl = document.getElementById('menu-about')
const importView = document.getElementById('import-view')
const bookshelfView = document.getElementById('bookshelf-view')
const queueView = document.getElementById('queue-view')
const queueEmptyView = document.getElementById('queue-empty-view')
const infoView = document.getElementById('info-view')
const aboutView = document.getElementById('about-view')
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
      books: parsed.books && typeof parsed.books === 'object' ? parsed.books : {}
    }
  } catch {
    return { selectedBookId: null, books: {} }
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
let activeView = 'library'
let detachSectionTracker = null

const menuItemsByView = {
  read: menuReadEl,
  queue: menuReviewEl,
  library: menuLibraryEl,
  import: menuImportEl,
  info: menuInfoEl,
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

function updateLayoutMetrics() {
  const root = document.documentElement
  const viewportHeight = Math.floor(window.visualViewport?.height || window.innerHeight || 0)
  const topHeight = Math.ceil(appHeaderEl?.getBoundingClientRect().height || 0)
  const bottomHeight = Math.ceil(appFooterEl?.getBoundingClientRect().height || 0)

  if (viewportHeight > 0) {
    root.style.setProperty('--app-height', `${viewportHeight}px`)
  }
  if (topHeight > 0) {
    root.style.setProperty('--top-bar-height', `${topHeight}px`)
  }
  if (bottomHeight > 0) {
    root.style.setProperty('--bottom-bar-height', `${bottomHeight}px`)
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
  switchView('read')
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

const BUCKETS = [
  { key: 'overdue',  label: 'Overdue',   color: '#ef4444' },
  { key: 'today',    label: 'Today',      color: '#f97316' },
  { key: 'tomorrow', label: 'Tomorrow',   color: '#facc15' },
  { key: 'week',     label: 'This week',  color: '#60a5fa' },
  { key: 'later',    label: 'Later',      color: '#4ade80' },
]

function daysDiff(dueDateStr, todayStr) {
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const [dy, dm, dd] = dueDateStr.split('-').map(Number)
  return Math.round((new Date(dy, dm - 1, dd) - new Date(ty, tm - 1, td)) / 86400000)
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
  else text = dueDateStr
  return { text, cssClass: 'due-' + bucket.key }
}

async function getDueReviews() {
  const todayStr = localDateStr()
  const allReviews = await getAllReviews()
  return allReviews
    .filter(review => review.dueDate <= todayStr)
    .sort((a, b) => (
      a.dueDate.localeCompare(b.dueDate) ||
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
  const activeBook = books.find(b => b.id === activeItem.bookId)
  reviewQueueSummaryEl.textContent = `Reviewing ${activeNumber} of ${dueItems.length}: ${activeBook ? activeBook.title : 'Unknown book'} • ${activeItem.sectionName}`

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

  allReviews.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

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
    metaEl.textContent = `${book ? book.title : 'Unknown book'} • ${review.chapterFile}`

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

function switchView(view) {
  activeView = view
  importView.style.display = view === 'import' ? '' : 'none'
  bookshelfView.style.display = view === 'library' ? '' : 'none'
  queueView.style.display = 'none'
  queueEmptyView.style.display = 'none'
  infoView.style.display = view === 'info' ? '' : 'none'
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
  switchView('library')
  await refreshBooks()
  await restoreLastReadingPosition()
}

init()
