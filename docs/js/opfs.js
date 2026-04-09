function normalizePath(path) {
  const parts = String(path || '')
    .split('/')
    .filter(Boolean)

  const out = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }

  return out
}

async function ensureDirectory(root, pathParts) {
  let current = root
  for (const part of pathParts) {
    current = await current.getDirectoryHandle(part, { create: true })
  }
  return current
}

export function isOpfsSupported() {
  return !!(navigator.storage && navigator.storage.getDirectory)
}

async function getBookFilesDirectory(bookId) {
  const root = await navigator.storage.getDirectory()
  const booksDir = await root.getDirectoryHandle('books', { create: true })
  const bookDir = await booksDir.getDirectoryHandle(bookId)
  return bookDir.getDirectoryHandle('files')
}

async function walkDirectory(dirHandle, basePath = '') {
  const paths = []
  for await (const [name, handle] of dirHandle.entries()) {
    const fullPath = basePath ? `${basePath}/${name}` : name
    if (handle.kind === 'directory') {
      const nested = await walkDirectory(handle, fullPath)
      paths.push(...nested)
    } else {
      paths.push(fullPath)
    }
  }
  return paths
}

async function getBookFileHandle(bookId, relativePath) {
  const filesDir = await getBookFilesDirectory(bookId)
  const parts = normalizePath(relativePath)
  const fileName = parts.pop()

  if (!fileName) {
    throw new Error(`Invalid book file path: ${relativePath}`)
  }

  let current = filesDir
  for (const part of parts) {
    current = await current.getDirectoryHandle(part)
  }

  return current.getFileHandle(fileName)
}

export async function writeBookFile(bookId, relativePath, data) {
  if (!isOpfsSupported()) {
    throw new Error('OPFS is not supported in this browser')
  }

  const root = await navigator.storage.getDirectory()
  const booksDir = await root.getDirectoryHandle('books', { create: true })
  const bookDir = await booksDir.getDirectoryHandle(bookId, { create: true })
  const filesDir = await bookDir.getDirectoryHandle('files', { create: true })

  const parts = normalizePath(relativePath)
  const fileName = parts.pop()
  if (!fileName) return

  const targetDir = await ensureDirectory(filesDir, parts)
  const fileHandle = await targetDir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

export async function deleteBookFiles(bookId) {
  const root = await navigator.storage.getDirectory()
  const booksDir = await root.getDirectoryHandle('books', { create: true })
  await booksDir.removeEntry(bookId, { recursive: true })
}

/**
 * Returns true if the book's EPUB files have been imported on this device
 * (i.e. its OPFS directory exists). Returns false if the book only came from
 * a sync and the EPUB has never been imported here.
 */
export async function isBookImportedLocally(bookId) {
  try {
    const root = await navigator.storage.getDirectory()
    const booksDir = await root.getDirectoryHandle('books', { create: true })
    await booksDir.getDirectoryHandle(bookId)
    return true
  } catch {
    return false
  }
}

/** Lists all relative EPUB file paths for a locally imported book. */
export async function listBookFiles(bookId) {
  try {
    const filesDir = await getBookFilesDirectory(bookId)
    return walkDirectory(filesDir)
  } catch {
    return []
  }
}

export async function readBookFileBytes(bookId, relativePath) {
  const fileHandle = await getBookFileHandle(bookId, relativePath)
  const file = await fileHandle.getFile()
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

export async function readBookFileText(bookId, relativePath) {
  const fileHandle = await getBookFileHandle(bookId, relativePath)
  const file = await fileHandle.getFile()
  return file.text()
}
