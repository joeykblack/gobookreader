import { getAllBooks, upsertBook } from './db.js'
import { importEpubFile } from './epub.js'
import { isOpfsSupported } from './opfs.js'
import { createReaderController } from './reader.js'

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

let books = []
let selectedBookId = null

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
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = `${book.title} (${book.author})`
    button.addEventListener('click', () => {
      selectedBookId = book.id
      renderChapterList(book)
    })
    li.append(button)
    booksListEl.append(li)
  }

  const selected = books.find(book => book.id === selectedBookId) || books[0]
  selectedBookId = selected.id
  renderChapterList(selected)
}

async function refreshBooks() {
  books = await getAllBooks()
  renderBooks()
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
  await refreshBooks()
}

init()
