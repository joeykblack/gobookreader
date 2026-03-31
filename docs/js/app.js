import { getAllBooks, upsertBook } from './db.js'
import { importEpubFile } from './epub.js'
import { isOpfsSupported } from './opfs.js'

const swStatusEl = document.getElementById('sw-status')
const appStatusEl = document.getElementById('app-status')
const importInputEl = document.getElementById('epub-file')
const importButtonEl = document.getElementById('import-button')
const booksListEl = document.getElementById('books-list')
const chapterListEl = document.getElementById('chapter-list')
const selectedBookTitleEl = document.getElementById('selected-book-title')

let books = []

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
    li.textContent = `${chapter.index + 1}. ${chapter.href}`
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
    button.addEventListener('click', () => renderChapterList(book))
    li.append(button)
    booksListEl.append(li)
  }

  renderChapterList(books[0])
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
    setStatus('Ready. Import an EPUB to begin.')
  }

  importButtonEl.addEventListener('click', importSelectedEpub)
  await refreshBooks()
}

init()
