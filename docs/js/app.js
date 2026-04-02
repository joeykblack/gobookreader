import {
  getAllBooks,
  getAllReviews,
  upsertBook,
  deleteBook,
  upsertReview,
  getReview,
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
const chapterListEl = document.getElementById('chapter-list')
const selectedBookTitleEl = document.getElementById('selected-book-title')
const readerRootEl = document.getElementById('reader-panel')
const readerTitleEl = document.getElementById('reader-title')
const readerChapterSelectEl = document.getElementById('reader-chapter-select')
const readerPrevButtonEl = document.getElementById('reader-prev')
const readerNextButtonEl = document.getElementById('reader-next')
const readerCloseButtonEl = document.getElementById('reader-close')
const readerFrameEl = document.getElementById('reader-frame')
const viewBookshelfBtn = document.getElementById('view-bookshelf')
const viewQueueBtn = document.getElementById('view-queue')
const bookshelfView = document.getElementById('bookshelf-view')
const queueView = document.getElementById('queue-view')
const reviewQueueListEl = document.getElementById('review-queue-list')

let books = []
let selectedBookId = null
let currentReviewItem = null  // Track which item from queue is being reviewed

const reader = createReaderController({
  rootEl: readerRootEl,
  titleEl: readerTitleEl,
  selectEl: readerChapterSelectEl,
  prevButtonEl: readerPrevButtonEl,
  nextButtonEl: readerNextButtonEl,
  closeButtonEl: readerCloseButtonEl,
  frameEl: readerFrameEl,
  statusCallback: setStatus
})

function setStatus(message, kind = '') {
  appStatusEl.textContent = message
  appStatusEl.className = kind
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

function renderChapterList(book) {
  chapterListEl.innerHTML = ''

  if (!book) {
    selectedBookTitleEl.textContent = 'No book selected'
    return
  }

  selectedBookTitleEl.textContent = `${book.title} — Chapters`

  if (!book.chapters?.length) {
    const li = document.createElement('li')
    li.textContent = 'No spine chapters found in OPF.'
    chapterListEl.append(li)
    return
  }

  for (const chapter of book.chapters) {
    const li = document.createElement('li')
    const openButton = document.createElement('button')
    openButton.type = 'button'
    openButton.textContent = `${chapter.index + 1}. ${chapter.href}`
    openButton.addEventListener('click', async () => {
      await reader.openBook(book, chapter.index)
    })
    li.append(openButton)
    chapterListEl.append(li)
  }
}

function renderBooks() {
  booksListEl.innerHTML = ''

  if (!books.length) {
    const li = document.createElement('li')
    li.textContent = 'No books imported yet.'
    booksListEl.append(li)
    renderChapterList(null)
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
    selectBtn.addEventListener('click', () => {
      selectedBookId = book.id
      renderChapterList(book)
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
  renderChapterList(selected)
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
    await upsertReview(review)
    setStatus(`Marked "${sectionName}" for review. Due ${review.dueDate}.`, 'ok')
  } else {
    const updated = applySm2Rating(review, rating, new Date())
    await upsertReview(updated)
    setStatus(
      `${rating}: "${sectionName}" — due ${updated.dueDate} | ${updated.intervalDays}d | EF ${updated.easeFactor}`,
      'ok'
    )
  }

  // If this item was opened from the queue, refresh the queue
  if (currentReviewItem && currentReviewItem.itemId === itemId) {
    await renderReviewQueue()
  }
}

async function refreshBooks() {
  books = await getAllBooks()
  renderBooks()
}

/**
 * Render the review queue: all reviews with dueDate <= today (local date).
 */
async function renderReviewQueue() {
  const todayStr = (() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })()

  const allReviews = await getAllReviews()
  const dueItems = allReviews.filter(review => review.dueDate <= todayStr)

  reviewQueueListEl.innerHTML = ''

  if (!dueItems.length) {
    const li = document.createElement('li')
    li.textContent = 'No items due today. Great work!'
    li.style.padding = '1rem'
    li.style.textAlign = 'center'
    li.style.color = '#9ca3af'
    reviewQueueListEl.append(li)
    return
  }

  // Sort by dueDate ascending (earliest first)
  dueItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  for (const review of dueItems) {
    const li = document.createElement('li')
    li.className = 'queue-item'

    const sectionEl = document.createElement('div')
    sectionEl.className = 'queue-item-section'
    sectionEl.textContent = review.sectionName

    const metaEl = document.createElement('div')
    metaEl.className = 'queue-item-meta'
    const book = books.find(b => b.id === review.bookId)
    const bookTitle = book ? book.title : 'Unknown book'
    metaEl.textContent = `${bookTitle} • ${review.chapterFile} • due ${review.dueDate}`

    li.append(sectionEl, metaEl)

    li.addEventListener('click', async () => {
      const book = books.find(b => b.id === review.bookId)
      if (!book) {
        setStatus('Book not found.', 'warn')
        return
      }

      const chapterIndex = book.chapters.findIndex(ch => ch.href === review.chapterFile)
      if (chapterIndex < 0) {
        setStatus('Chapter not found.', 'warn')
        return
      }

      currentReviewItem = review
      await reader.openBook(book, chapterIndex)
      scrollIframeToSection(review.sectionName)
      setStatus(`Reviewing: "${review.sectionName}" from ${bookTitle}`, 'ok')
    })

    reviewQueueListEl.append(li)
  }
}

function switchView(view) {
  if (view === 'bookshelf') {
    bookshelfView.style.display = ''
    queueView.style.display = 'none'
    viewBookshelfBtn.classList.add('active')
    viewQueueBtn.classList.remove('active')
  } else {
    bookshelfView.style.display = 'none'
    queueView.style.display = ''
    viewBookshelfBtn.classList.remove('active')
    viewQueueBtn.classList.add('active')
    renderReviewQueue()
  }
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

    // Find all h2 and h3 headings
    const headings = Array.from(iframeDoc.querySelectorAll('h2, h3'))
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
    await refreshBooks()
    setStatus(`Imported: ${book.title}`, 'ok')
  } catch (err) {
    setStatus(`Import failed: ${err.message}`, 'warn')
  } finally {
    importButtonEl.disabled = false
  }
}

async function init() {
  await registerServiceWorker()

  if (!isOpfsSupported()) {
    setStatus('OPFS is not supported in this browser. Use a Chromium-based browser.', 'warn')
  } else {
    setStatus('Ready. Import an EPUB and open a chapter to read.')
  }

  importButtonEl.addEventListener('click', importSelectedEpub)
  viewBookshelfBtn.addEventListener('click', () => switchView('bookshelf'))
  viewQueueBtn.addEventListener('click', () => switchView('queue'))
  window.addEventListener('message', handleSrsMessage)
  await refreshBooks()
}

init()
