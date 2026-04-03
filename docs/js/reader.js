import { readBookFileBytes, readBookFileText } from './opfs.js'
import { enhanceChapter } from './enhance.js'

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

function isExternalUrl(value) {
  const text = String(value || '').trim()
  return (
    !text ||
    text.startsWith('#') ||
    text.startsWith('data:') ||
    text.startsWith('blob:') ||
    text.startsWith('http://') ||
    text.startsWith('https://') ||
    text.startsWith('mailto:') ||
    text.startsWith('javascript:')
  )
}

function splitUrlAndHash(url) {
  const idx = url.indexOf('#')
  if (idx < 0) {
    return { path: url, hash: '' }
  }
  return {
    path: url.slice(0, idx),
    hash: url.slice(idx)
  }
}

function inferMimeType(path) {
  const lower = String(path || '').toLowerCase()

  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript'
  if (lower.endsWith('.css')) return 'text/css'
  if (lower.endsWith('.xhtml') || lower.endsWith('.xht')) return 'application/xhtml+xml'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.woff2')) return 'font/woff2'
  if (lower.endsWith('.woff')) return 'font/woff'
  if (lower.endsWith('.ttf')) return 'font/ttf'
  if (lower.endsWith('.otf')) return 'font/otf'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.xml')) return 'application/xml'

  return 'application/octet-stream'
}

export function createReaderController({
  rootEl,
  titleEl,
  selectEl,
  pageIndicatorEl,
  prevButtonEl,
  nextButtonEl,
  contentsButtonEl,
  closeButtonEl,
  frameEl,
  getTheme,
  statusCallback,
  reviewStateProvider,
  onLocationChange
}) {
  let currentBook = null
  let chapterIndex = 0
  let pendingHash = ''
  let selectNavEntries = null
  let activeChapterUrl = null
  let viewVisible = true
  let activeTheme = 'light'
  const activeAssetUrls = new Set()

  function normalizeTheme(value) {
    const theme = String(value || '').trim().toLowerCase()
    if (theme === 'sepia' || theme === 'dim-sepia') return theme
    return 'light'
  }

  function currentTheme() {
    return normalizeTheme(getTheme ? getTheme() : activeTheme)
  }

  function injectThemeStyle(doc, theme) {
    const normalized = normalizeTheme(theme)
    if (normalized === 'light') return

    const palettes = {
      sepia: {
        bg: '#f4ecd8',
        text: '#3b2f2a',
        link: '#5b3f2b',
        codeBg: '#eadfca',
        border: '#cbbca3'
      },
      'dim-sepia': {
        bg: '#2a241c',
        text: '#e6dcc9',
        link: '#d8b98a',
        codeBg: '#3a3227',
        border: '#4e4436'
      }
    }

    const p = palettes[normalized] || palettes.sepia
    const style = doc.createElement('style')
    style.setAttribute('data-gorecall-theme', normalized)
    style.textContent = `
      html, body {
        background: ${p.bg} !important;
        color: ${p.text} !important;
      }
      body, p, li, dt, dd, blockquote, h1, h2, h3, h4, h5, h6, table, td, th, figcaption {
        color: ${p.text} !important;
      }
      a, a:visited {
        color: ${p.link} !important;
      }
      pre, code {
        background: ${p.codeBg} !important;
        color: ${p.text} !important;
      }
      hr, table, td, th, pre, code, blockquote {
        border-color: ${p.border} !important;
      }
    `

    const head = doc.querySelector('head')
    if (head) head.append(style)
    else doc.documentElement?.prepend(style)
  }

  function setStatus(message, kind = '') {
    if (statusCallback) {
      statusCallback(message, kind)
    }
  }

  function revokeUrls() {
    if (activeChapterUrl) {
      URL.revokeObjectURL(activeChapterUrl)
      activeChapterUrl = null
    }

    for (const url of activeAssetUrls) {
      URL.revokeObjectURL(url)
    }
    activeAssetUrls.clear()
  }

  function setVisible(visible) {
    rootEl.style.display = visible && viewVisible ? 'block' : 'none'
  }

  function setViewVisible(visible) {
    viewVisible = !!visible
    setVisible(!!currentBook)
  }

  function chapterCount() {
    return currentBook?.chapters?.length || 0
  }

  function getChapterIndexForHref(book, href) {
    const text = String(href || '')
    const hashIndex = text.indexOf('#')
    const path = hashIndex >= 0 ? text.slice(0, hashIndex) : text
    return book?.chapters?.findIndex(ch => ch.href === path) ?? -1
  }

  function getContentsChapterIndex(book) {
    if (!book?.chapters?.length) return -1
    return book.chapters.findIndex(ch => {
      const href = String(ch.href || '').toLowerCase()
      return href.endsWith('contents.xhtml') || href.endsWith('contents.html')
    })
  }

  function updateControls() {
    const count = chapterCount()
    const hasBook = !!currentBook

    prevButtonEl.disabled = !hasBook || chapterIndex <= 0
    nextButtonEl.disabled = !hasBook || chapterIndex >= count - 1
    selectEl.disabled = !hasBook || count === 0
    if (contentsButtonEl) {
      contentsButtonEl.disabled = !hasBook || getContentsChapterIndex(currentBook) < 0
    }

    if (!hasBook) {
      titleEl.textContent = ''
      if (pageIndicatorEl) {
        pageIndicatorEl.textContent = 'Page 0 of 0'
      }
      return
    }

    titleEl.textContent = currentBook.title
    if (pageIndicatorEl) {
      pageIndicatorEl.textContent = `Page ${chapterIndex + 1} of ${count}`
    }
  }

  function renderSelect() {
    selectEl.innerHTML = ''
    selectNavEntries = null

    if (!currentBook) {
      return
    }

    const navItems = Array.isArray(currentBook.navigation) ? currentBook.navigation : []
    const mappedNav = navItems
      .map(nav => ({
        ...nav,
        chapterIndex: getChapterIndexForHref(currentBook, nav.href),
      }))
      .filter(nav => nav.chapterIndex >= 0)

    if (mappedNav.length) {
      selectNavEntries = mappedNav

      mappedNav.forEach((nav, idx) => {
        const option = document.createElement('option')
        option.value = String(idx)
        const indent = '  '.repeat(Math.max(0, Number(nav.depth || 0)))
        option.textContent = `${indent}${nav.label}`
        selectEl.append(option)
      })

      const selectedNavIdx = mappedNav.findIndex(nav => nav.chapterIndex === chapterIndex)
      selectEl.value = String(selectedNavIdx >= 0 ? selectedNavIdx : 0)
      return
    }

    currentBook.chapters.forEach(chapter => {
      const option = document.createElement('option')
      option.value = String(chapter.index)
      option.textContent = `${chapter.index + 1}. ${chapter.href}`
      selectEl.append(option)
    })

    selectEl.value = String(chapterIndex)
  }

  async function getAssetBlobUrl(bookId, chapterDir, ref, cssMap) {
    if (isExternalUrl(ref)) {
      return ref
    }

    const { path, hash } = splitUrlAndHash(ref)
    if (!path) {
      return ref
    }

    const resolvedPath = resolvePath(chapterDir, path)

    if (cssMap.has(resolvedPath)) {
      return `${cssMap.get(resolvedPath)}${hash}`
    }

    const lower = resolvedPath.toLowerCase()

    if (lower.endsWith('.css')) {
      const cssText = await readBookFileText(bookId, resolvedPath)
      const rewritten = await rewriteCssUrls(bookId, resolvedPath, cssText, cssMap)
      const cssBlob = new Blob([rewritten], { type: 'text/css' })
      const cssUrl = URL.createObjectURL(cssBlob)
      activeAssetUrls.add(cssUrl)
      cssMap.set(resolvedPath, cssUrl)
      return `${cssUrl}${hash}`
    }

    const bytes = await readBookFileBytes(bookId, resolvedPath)
    const blob = new Blob([bytes], { type: inferMimeType(resolvedPath) })
    const url = URL.createObjectURL(blob)
    activeAssetUrls.add(url)
    return `${url}${hash}`
  }

  async function rewriteCssUrls(bookId, cssPath, cssText, cssMap) {
    const cssDir = dirname(cssPath)
    const urlRegex = /url\((['"]?)([^'"\)]+)\1\)/g

    const matches = Array.from(cssText.matchAll(urlRegex))
    if (!matches.length) {
      return cssText
    }

    let output = cssText

    for (const match of matches) {
      const original = match[0]
      const ref = match[2]

      if (isExternalUrl(ref)) {
        continue
      }

      const rewrittenUrl = await getAssetBlobUrl(bookId, cssDir, ref, cssMap)
      output = output.replace(original, `url("${rewrittenUrl}")`)
    }

    return output
  }

  async function buildChapterDocument(book, chapter) {
    const chapterPath = chapter.href
    const chapterDir = dirname(chapterPath)

    const sourceText = await readBookFileText(book.id, chapterPath)
    const parser = new DOMParser()
    const isXhtml = String(chapter.mediaType || '').toLowerCase().includes('xhtml')
    const parseType = isXhtml ? 'application/xhtml+xml' : 'text/html'
    const doc = parser.parseFromString(sourceText, parseType)

    if (!doc.documentElement || doc.querySelector('parsererror')) {
      throw new Error(`Could not parse chapter: ${chapterPath}`)
    }

    const cssMap = new Map()

    const attributeTargets = [
      ['img', 'src'],
      ['script', 'src'],
      ['source', 'src'],
      ['audio', 'src'],
      ['video', 'src'],
      ['video', 'poster'],
      ['object', 'data']
    ]

    for (const [selector, attr] of attributeTargets) {
      const elements = Array.from(doc.querySelectorAll(`${selector}[${attr}]`))
      for (const el of elements) {
        const current = el.getAttribute(attr)
        if (!current || isExternalUrl(current)) continue
        const rewritten = await getAssetBlobUrl(book.id, chapterDir, current, cssMap)
        el.setAttribute(attr, rewritten)
      }
    }

    const linkElements = Array.from(doc.querySelectorAll('link[href]'))
    for (const linkEl of linkElements) {
      const href = linkEl.getAttribute('href')
      if (!href || isExternalUrl(href)) continue

      const rel = (linkEl.getAttribute('rel') || '').toLowerCase()
      if (rel.includes('stylesheet')) {
        const rewritten = await getAssetBlobUrl(book.id, chapterDir, href, cssMap)
        linkEl.setAttribute('href', rewritten)
      }
    }

    const styleElements = Array.from(doc.querySelectorAll('style'))
    for (const styleEl of styleElements) {
      const cssText = styleEl.textContent || ''
      if (!cssText.trim()) continue
      const rewrittenCss = await rewriteCssUrls(book.id, chapterPath, cssText, cssMap)
      styleEl.textContent = rewrittenCss
    }

    const chapterAnchors = Array.from(doc.querySelectorAll('a[href]'))
    for (const anchor of chapterAnchors) {
      const href = anchor.getAttribute('href')
      if (!href || isExternalUrl(href) || href.startsWith('#')) continue

      const { path, hash } = splitUrlAndHash(href)
      const resolved = resolvePath(chapterDir, path)

      if (resolved === chapterPath && hash) {
        anchor.setAttribute('href', hash)
      }
    }

    // Cross-browser SVG text centering fix (Firefox can render move numbers slightly high).
    const svgNumberTexts = Array.from(doc.querySelectorAll('svg text'))
    for (const textEl of svgNumberTexts) {
      const value = (textEl.textContent || '').trim()
      if (!/^\d+$/.test(value)) continue

      textEl.setAttribute('dy', '0.30em')
    }

    // Inject answer hiding and persisted SRS button states for GoBooks problem pages.
    const reviewStates = reviewStateProvider
      ? await reviewStateProvider(book.id, chapterPath)
      : new Map()
    enhanceChapter(doc, reviewStates)
    injectThemeStyle(doc, currentTheme())

    if (isXhtml) {
      return new XMLSerializer().serializeToString(doc)
    }

    return '<!doctype html>\n' + doc.documentElement.outerHTML
  }

  async function renderCurrentChapter() {
    if (!currentBook) return

    const chapter = currentBook.chapters[chapterIndex]
    if (!chapter) return

    revokeUrls()
    setStatus(`Loading chapter ${chapterIndex + 1}…`)

    try {
      const html = await buildChapterDocument(currentBook, chapter)
      const chapterType = chapter.mediaType || inferMimeType(chapter.href)
      const chapterBlob = new Blob([html], { type: chapterType })
      activeChapterUrl = URL.createObjectURL(chapterBlob)
      frameEl.src = activeChapterUrl

      const hashToScroll = pendingHash
      pendingHash = ''

      if (hashToScroll) {
        const scrollOnLoad = () => {
          try {
            const doc = frameEl.contentDocument || frameEl.contentWindow?.document
            if (!doc) return

            const anchorId = decodeURIComponent(hashToScroll.replace(/^#/, ''))
            const target =
              doc.getElementById(anchorId) ||
              doc.querySelector(`[name="${CSS.escape(anchorId)}"]`)

            if (target) {
              target.scrollIntoView({ behavior: 'auto', block: 'start' })
            }
          } catch {
            // Ignore anchor scrolling errors.
          }
        }

        frameEl.addEventListener('load', scrollOnLoad, { once: true })
      }

      const wireLinksOnLoad = () => {
        try {
          const doc = frameEl.contentDocument || frameEl.contentWindow?.document
          if (!doc || !currentBook) return

          const chapterDir = dirname(chapter.href)
          const anchors = Array.from(doc.querySelectorAll('a[href]'))

          for (const anchor of anchors) {
            const href = (anchor.getAttribute('href') || '').trim()
            if (!href || isExternalUrl(href) || href.startsWith('#')) continue

            const { path, hash } = splitUrlAndHash(href)
            if (!path) continue

            const resolvedPath = resolvePath(chapterDir, path)
            const targetIndex = currentBook.chapters.findIndex(ch => ch.href === resolvedPath)
            if (targetIndex < 0) continue

            anchor.addEventListener('click', async event => {
              event.preventDefault()

              chapterIndex = targetIndex
              pendingHash = hash || ''
              renderSelect()
              await renderCurrentChapter()
            })
          }
        } catch {
          // Ignore iframe link wiring errors.
        }
      }

      frameEl.addEventListener('load', wireLinksOnLoad, { once: true })

      updateControls()
      setStatus(`Reading: ${currentBook.title} / ${chapter.href}`, 'ok')

      if (onLocationChange) {
        onLocationChange({
          bookId: currentBook.id,
          chapterFile: chapter.href
        })
      }
    } catch (err) {
      frameEl.srcdoc = `<pre style="white-space:pre-wrap;color:#fca5a5;">Failed to render chapter:\n${String(err.message || err)}</pre>`
      setStatus(`Reader error: ${err.message}`, 'warn')
    }
  }

  async function openBook(book, startIndex = 0, startHash = '') {
    if (!book?.chapters?.length) {
      setStatus('This book has no readable spine chapters.', 'warn')
      return
    }

    currentBook = book
    chapterIndex = Math.max(0, Math.min(startIndex, book.chapters.length - 1))
    pendingHash = startHash || ''

    setVisible(true)
    renderSelect()
    updateControls()
    await renderCurrentChapter()
  }

  function closeReader() {
    currentBook = null
    chapterIndex = 0
    revokeUrls()
    frameEl.src = 'about:blank'
    setVisible(false)
    updateControls()
    setStatus('Reader closed.')
  }

  prevButtonEl.addEventListener('click', async () => {
    if (!currentBook || chapterIndex <= 0) return
    chapterIndex -= 1
    selectEl.value = String(chapterIndex)
    await renderCurrentChapter()
  })

  nextButtonEl.addEventListener('click', async () => {
    if (!currentBook || chapterIndex >= chapterCount() - 1) return
    chapterIndex += 1
    selectEl.value = String(chapterIndex)
    await renderCurrentChapter()
  })

  if (contentsButtonEl) {
    contentsButtonEl.addEventListener('click', async () => {
      if (!currentBook) return
      const contentsIndex = getContentsChapterIndex(currentBook)
      if (contentsIndex < 0) return

      chapterIndex = contentsIndex
      pendingHash = ''
      renderSelect()
      await renderCurrentChapter()
    })
  }

  selectEl.addEventListener('change', async () => {
    if (!currentBook) return
    const requested = Number.parseInt(selectEl.value, 10)
    if (!Number.isFinite(requested)) return

    if (selectNavEntries?.length) {
      const nav = selectNavEntries[requested]
      if (!nav) return
      chapterIndex = nav.chapterIndex
      const hashIndex = String(nav.href || '').indexOf('#')
      pendingHash = hashIndex >= 0 ? String(nav.href).slice(hashIndex) : ''
    } else {
      chapterIndex = Math.max(0, Math.min(requested, chapterCount() - 1))
      pendingHash = ''
    }

    await renderCurrentChapter()
  })

  if (closeButtonEl) {
    closeButtonEl.addEventListener('click', closeReader)
  }

  setVisible(false)
  updateControls()

  return {
    openBook,
    closeReader,
    setViewVisible,
    getCurrentLocation() {
      if (!currentBook) return null
      const chapter = currentBook.chapters[chapterIndex]
      if (!chapter) return null

      return {
        bookId: currentBook.id,
        chapterFile: chapter.href,
        positionOffset: 0
      }
    },
    isOpen(bookId) {
      if (bookId !== undefined) return currentBook?.id === bookId
      return !!currentBook
    },
    async setTheme(theme) {
      activeTheme = normalizeTheme(theme)
      if (currentBook) {
        await renderCurrentChapter()
      }
    }
  }
}
