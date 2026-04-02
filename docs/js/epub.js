import { writeBookFile } from './opfs.js'

const JSZipLib = window.JSZip

if (!JSZipLib) {
  throw new Error('JSZip failed to load from CDN')
}

function sanitizeId(input) {
  const base = String(input || '').trim()
  const cleaned = base.replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || `book_${Date.now()}`
}

function getAllElementsByLocalName(root, name) {
  return Array.from(root.getElementsByTagName('*')).filter(el => el.localName === name)
}

function firstText(root, localName) {
  const match = getAllElementsByLocalName(root, localName)[0]
  return match ? (match.textContent || '').trim() : ''
}

function dirname(path) {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(0, idx) : ''
}

function resolvePath(baseDir, relPath) {
  const joined = [baseDir, relPath].filter(Boolean).join('/')
  const parts = joined.split('/')
  const out = []

  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }

  return out.join('/')
}

function splitUrlAndHash(url) {
  const idx = String(url || '').indexOf('#')
  if (idx < 0) return { path: String(url || ''), hash: '' }
  return {
    path: String(url || '').slice(0, idx),
    hash: String(url || '').slice(idx)
  }
}

function getDirectChildrenByLocalName(parent, localName) {
  return Array.from(parent?.children || []).filter(el => el.localName === localName)
}

function parseNavigation(navText, navPath) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(navText, 'application/xhtml+xml')
  if (!doc.documentElement || doc.querySelector('parsererror')) {
    return []
  }

  const navDir = dirname(navPath)
  const navElements = Array.from(doc.getElementsByTagName('nav'))

  const tocNav =
    navElements.find(el => {
      const epubType = (el.getAttribute('epub:type') || '').toLowerCase()
      const role = (el.getAttribute('role') || '').toLowerCase()
      return epubType.includes('toc') || role.includes('doc-toc')
    }) || navElements[0]

  if (!tocNav) return []

  const rootList =
    getDirectChildrenByLocalName(tocNav, 'ol')[0] ||
    getDirectChildrenByLocalName(tocNav, 'ul')[0]

  if (!rootList) return []

  const items = []

  function walkList(listEl, depth) {
    const lis = getDirectChildrenByLocalName(listEl, 'li')

    for (const li of lis) {
      const directLinks = getDirectChildrenByLocalName(li, 'a')
      const link = directLinks[0]

      if (link) {
        const href = (link.getAttribute('href') || '').trim()
        if (href) {
          const { path, hash } = splitUrlAndHash(href)
          const resolved = path ? resolvePath(navDir, path) : ''
          items.push({
            label: (link.textContent || '').trim() || href,
            href: `${resolved}${hash}`,
            depth
          })
        }
      }

      const nestedList =
        getDirectChildrenByLocalName(li, 'ol')[0] ||
        getDirectChildrenByLocalName(li, 'ul')[0]

      if (nestedList) {
        walkList(nestedList, depth + 1)
      }
    }
  }

  walkList(rootList, 0)
  return items
}

function parseOpf(opfText, opfPath) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(opfText, 'application/xml')

  if (doc.querySelector('parsererror')) {
    throw new Error('Failed to parse OPF XML')
  }

  const title = firstText(doc, 'title')
  const author = firstText(doc, 'creator')
  const identifier = firstText(doc, 'identifier')

  const manifestItems = getAllElementsByLocalName(doc, 'item')
  const manifestById = new Map()
  let navHref = ''

  for (const item of manifestItems) {
    const id = item.getAttribute('id')
    if (!id) continue
    manifestById.set(id, {
      id,
      href: item.getAttribute('href') || '',
      mediaType: item.getAttribute('media-type') || ''
    })

    const properties = (item.getAttribute('properties') || '').toLowerCase()
    if (!navHref && properties.split(/\s+/).includes('nav')) {
      navHref = item.getAttribute('href') || ''
    }
  }

  const opfDir = dirname(opfPath)
  const spineItems = getAllElementsByLocalName(doc, 'itemref')

  const chapters = spineItems
    .map(itemref => itemref.getAttribute('idref'))
    .filter(Boolean)
    .map(idref => manifestById.get(idref))
    .filter(item => item && item.href)
    .map((item, index) => ({
      index,
      idref: item.id,
      href: resolvePath(opfDir, item.href),
      mediaType: item.mediaType
    }))

  const navPath = navHref ? resolvePath(opfDir, navHref) : ''

  return { title, author, identifier, opfPath, chapters, navPath }
}

export async function importEpubFile(file, setProgress) {
  const zip = await JSZipLib.loadAsync(file)

  const containerEntry = zip.file('META-INF/container.xml')
  if (!containerEntry) {
    throw new Error('EPUB is missing META-INF/container.xml')
  }

  const containerXml = await containerEntry.async('text')
  const parser = new DOMParser()
  const containerDoc = parser.parseFromString(containerXml, 'application/xml')

  const rootfile = getAllElementsByLocalName(containerDoc, 'rootfile')[0]
  const opfPath = rootfile?.getAttribute('full-path')

  if (!opfPath) {
    throw new Error('Could not locate OPF path in container.xml')
  }

  const opfEntry = zip.file(opfPath)
  if (!opfEntry) {
    throw new Error(`OPF file not found in archive: ${opfPath}`)
  }

  const opfText = await opfEntry.async('text')
  const parsed = parseOpf(opfText, opfPath)

  let navigation = []
  if (parsed.navPath) {
    const navEntry = zip.file(parsed.navPath)
    if (navEntry) {
      const navText = await navEntry.async('text')
      navigation = parseNavigation(navText, parsed.navPath)
    }
  }

  const bookId = sanitizeId(parsed.identifier || file.name.replace(/\.epub$/i, ''))

  const entries = Object.values(zip.files)
  let written = 0

  for (const entry of entries) {
    if (entry.dir) continue
    const bytes = await entry.async('uint8array')
    await writeBookFile(bookId, entry.name, bytes)
    written += 1
    if (setProgress) {
      setProgress(`Imported ${written} files…`)
    }
  }

  return {
    id: bookId,
    title: parsed.title || file.name,
    author: parsed.author || 'Unknown',
    opfPath: parsed.opfPath,
    chapters: parsed.chapters,
    navigation,
    importedAt: new Date().toISOString()
  }
}
