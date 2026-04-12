import { writeBookFile } from './opfs.js'

const DEFAULT_PDF_PATH = 'book.pdf'

function sanitizeId(input) {
  const base = String(input || '').trim()
  const cleaned = base.replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || `book_${Date.now()}`
}

function getPdfJsLib() {
  const lib = window.pdfjsLib
  if (!lib) {
    throw new Error('pdf.js failed to load from CDN')
  }
  return lib
}

export async function importPdfFile(file, setProgress) {
  if (setProgress) setProgress('Reading PDF…')

  const pdfjsLib = getPdfJsLib()
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (setProgress) setProgress('Parsing PDF…')
  // Pass a copy to pdf.js — it transfers the ArrayBuffer to its worker thread
  // (detaching the original), so we preserve `bytes` intact for OPFS storage.
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise

  let title = ''
  let author = ''
  try {
    const metadata = await doc.getMetadata()
    title = metadata?.info?.Title || metadata?.metadata?.get?.('dc:title') || ''
    author = metadata?.info?.Author || metadata?.metadata?.get?.('dc:creator') || ''
  } catch {
    // Metadata is optional.
  }

  const baseName = file.name.replace(/\.pdf$/i, '')
  const bookId = sanitizeId(title || baseName)

  if (setProgress) setProgress('Saving PDF…')
  await writeBookFile(bookId, DEFAULT_PDF_PATH, bytes)

  const pageCount = Number(doc.numPages || 0)
  const chapters = Array.from({ length: pageCount }, (_, idx) => ({
    index: idx,
    idref: `pdf-page-${idx + 1}`,
    href: `pdf-page-${idx + 1}`,
    mediaType: 'application/pdf'
  }))

  return {
    id: bookId,
    title: title || baseName || file.name,
    author: author || 'Unknown',
    publicationDate: '',
    chapters,
    navigation: [],
    format: 'pdf',
    pdfPath: DEFAULT_PDF_PATH,
    pageCount,
    importedAt: new Date().toISOString()
  }
}
