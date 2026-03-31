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
