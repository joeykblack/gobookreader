/**
 * enhance.js — Post-load DOM enhancements for GoBooks EPUB chapters.
 *
 * Operates on a parsed DOM document before it is serialized to a Blob URL.
 * All injected interactivity uses inline event handlers (no external scripts)
 * because the iframe sandbox allows scripts but not module imports.
 *
 * Pipeline (order matters):
 *  1. injectSrsButtons      — appends SRS rating bar at the end of every section.
 *  2. injectAnswerHiding    — wraps answer sections in a hidden div; the SRS bar
 *     injected in step 1 is carried into the wrapper and revealed with the answer.
 *  3. injectHighlights      — re-applies saved highlights as <mark> elements.
 *  4. injectHighlightInteraction — injects a floating toolbar so the user can
 *     highlight selected text; posts messages to the parent frame.
 */

const ANSWER_HEADING_RE = /^Answer\b/i
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'

function isHeadingNode(node) {
  return (
    node?.nodeType === 1 &&
    /^h[1-6]$/i.test(node.tagName || '')
  )
}

function hasMeaningfulSectionContent(node) {
  if (!node) return false
  if (node.nodeType === 3) {
    return Boolean((node.textContent || '').trim())
  }
  if (node.nodeType !== 1) return false
  return !isHeadingNode(node)
}

const REVEAL_BTN_STYLE = [
  'margin: 1.5em auto',
  'display: block',
  'padding: 0.55em 1.8em',
  'font-size: 1em',
  'cursor: pointer',
  'background: #1d4ed8',
  'color: #fff',
  'border: 0',
  'border-radius: 8px'
].join(';')

const SRS_CONTAINER_STYLE = [
  'border-top: 1px solid #d1d5db',
  'padding-top: 0.55rem',
  'margin-top: 0.9rem',
  'display: flex',
  'gap: 0.35rem',
  'flex-wrap: wrap',
  'align-items: center'
].join(';')

const SRS_LABEL_STYLE = [
  'font-size: 0.78em',
  'color: #6b7280',
  'margin-right: 0.2rem',
  'user-select: none'
].join(';')

const SRS_BTN_STYLE = [
  'padding: 0.28em 0.65em',
  'font-size: 0.82em',
  'cursor: pointer',
  'border: 1px solid #cbd5e1',
  'border-radius: 6px',
  'background: #f8fafc',
  'color: #1e293b'
].join(';')

const SRS_ACTIVE_STYLE = [
  'background: #334155',
  'color: #ffffff',
  'border-color: #0f172a'
].join(';')

// Inline onclick uses data-* attributes to avoid quoting/escaping issues.
const SRS_ONCLICK =
  'this.parentNode.querySelectorAll("button[data-rating]").forEach(function(btn){' +
  'btn.style.background="#f8fafc";' +
  'btn.style.color="#1e293b";' +
  'btn.style.borderColor="#cbd5e1";' +
  '});' +
  'this.style.background="#334155";' +
  'this.style.color="#ffffff";' +
  'this.style.borderColor="#0f172a";' +
  'window.parent.postMessage(' +
  '{type:"srs",sectionName:this.dataset.section,rating:this.dataset.rating},' +
  '"*")'

function normalizeStoredRating(value) {
  const rating = String(value || '').trim()
  return ['Mark', 'Again', 'Hard', 'Good', 'Easy'].includes(rating) ? rating : ''
}

/** Build the SRS button group for a given section name. */
function makeSrsButtonGroup(doc, sectionName, activeRating = '') {
  const container = doc.createElement('div')
  container.className = 'gb-srs-controls'
  container.setAttribute('style', SRS_CONTAINER_STYLE)

  const label = doc.createElement('span')
  label.textContent = `${sectionName}:`
  label.setAttribute('style', SRS_LABEL_STYLE)
  container.appendChild(label)

  for (const rating of ['Mark', 'Again', 'Hard', 'Good', 'Easy']) {
    const btn = doc.createElement('button')
    btn.textContent = rating
    btn.setAttribute('data-section', sectionName)
    btn.setAttribute('data-rating', rating)
    btn.setAttribute('onclick', SRS_ONCLICK)
    const style = rating === activeRating
      ? `${SRS_BTN_STYLE};${SRS_ACTIVE_STYLE}`
      : SRS_BTN_STYLE
    btn.setAttribute('style', style)
    container.appendChild(btn)
  }

  return container
}

/**
 * Walk the body's direct children to build a list of sections. A section
 * begins at every heading h1-h6 and runs until (but not including) the next
 * heading h1-h6.
 * Content before the first heading is ignored.
 */
function collectSections(body) {
  const sections = []
  let current = null

  for (const node of body.childNodes) {
    const isHeading = isHeadingNode(node)

    if (isHeading) {
      if (current?.hasContent) sections.push(current)
      current = {
        name: (node.textContent || '').trim(),
        lastNode: node,
        hasContent: false,
      }
    } else if (current) {
      if (hasMeaningfulSectionContent(node)) {
        current.lastNode = node
        current.hasContent = true
      }
    }
  }

  if (current?.hasContent) sections.push(current)
  return sections
}

/**
 * Inject an SRS button bar after the last node of every section.
 * Must run BEFORE injectAnswerHiding so that the bar for an answer section
 * is carried into the hidden wrapper and revealed alongside the answer.
 */
function injectSrsButtons(doc, reviewStates = new Map()) {
  const body = doc.body || doc.querySelector('body')
  if (!body) return 0

  const sections = collectSections(body)
  if (!sections.length) return 0

  for (const { name, lastNode } of sections) {
    if (!lastNode.parentNode) continue
    const activeRating = normalizeStoredRating(reviewStates.get(name))
    const bar = makeSrsButtonGroup(doc, name, activeRating)
    const next = lastNode.nextSibling
    if (next) {
      lastNode.parentNode.insertBefore(bar, next)
    } else {
      lastNode.parentNode.appendChild(bar)
    }
  }

  return sections.length
}

/**
 * For each heading with class `break` whose text starts with `Answer`, hides
 * the nodes from that heading up to (but not including) the next heading
 * sibling, then
 * inserts a "Show Answer" button before the hidden section.
 *
 * Because injectSrsButtons has already run, the SRS bar for the answer section
 * is included among the collected nodes and will be hidden/revealed with them.
 *
 * Returns the number of answer sections found and hidden.
 */
function injectAnswerHiding(doc) {
  const answerHeadings = Array.from(doc.querySelectorAll(`${HEADING_SELECTOR}.break`)).filter(el =>
    ANSWER_HEADING_RE.test((el.textContent || '').trim())
  )

  if (!answerHeadings.length) return 0

  let count = 0

  answerHeadings.forEach((heading, i) => {
    const body = heading.parentNode
    if (!body) return

    // Collect nodes from this answer heading up to (not including)
    // the next heading sibling, or end of body.
    const siblings = Array.from(body.childNodes)
    const startIdx = siblings.indexOf(heading)
    if (startIdx < 0) return

    const answerNodes = []
    for (let j = startIdx; j < siblings.length; j++) {
      const node = siblings[j]
      // Stop before the next heading that comes AFTER our own heading.
      if (j > startIdx && isHeadingNode(node)) break
      answerNodes.push(node)
    }

    if (!answerNodes.length) return

    // Stable unique id per answer section.
    const wrapperId = `gb-answer-wrapper-${i}`
    const btnId = `gb-show-answer-btn-${i}`

    // Wrap answer nodes in a hidden container.
    const wrapper = doc.createElement('div')
    wrapper.id = wrapperId
    wrapper.setAttribute('style', 'display:none')

    // Insert wrapper before the first answer node, then move nodes into it.
    body.insertBefore(wrapper, answerNodes[0])
    for (const node of answerNodes) {
      wrapper.appendChild(node)
    }

    // Build the reveal button.
    const btn = doc.createElement('button')
    btn.id = btnId
    btn.textContent = 'Show Answer'
    btn.setAttribute(
      'onclick',
      `document.getElementById("${wrapperId}").style.display="";` +
      `this.style.display="none"`
    )
    btn.setAttribute('style', REVEAL_BTN_STYLE)

    body.insertBefore(btn, wrapper)
    count++
  })

  return count
}

// ── Highlight feature ─────────────────────────────────────────────────────────

const HIGHLIGHT_MARK_STYLE = [
  'background: #fef08a',
  'color: inherit',
  'border-radius: 2px',
  'cursor: pointer',
  'padding: 0 1px',
  'transition: background 0.15s'
].join(';')

// Inline onclick: posts {type:"remove-highlight", id} to parent.
const HIGHLIGHT_REMOVE_ONCLICK =
  '(function(el){window.parent.postMessage({type:"remove-highlight",id:+el.dataset.highlightId},"*")})(this)'

/**
 * Injected as an inline <script> into the chapter body.
 * Shows a floating "✓ Highlight" button when the user selects text, and posts
 * {type:"add-highlight", text, prefix, suffix} to the parent frame on click.
 */
const HIGHLIGHT_TOOLBAR_SCRIPT = [
  '(function(){',
  'var tb=document.createElement("div");',
  'tb.id="gb-hl-tb";',
  'tb.style.cssText="position:fixed;display:none;z-index:9999;background:#1e293b;border-radius:6px;',
  'padding:3px 8px;box-shadow:0 2px 10px rgba(0,0,0,.4);pointer-events:auto;";',
  'var btn=document.createElement("button");',
  'btn.textContent="\u2713 Highlight";',
  'btn.style.cssText="background:none;border:none;color:#fef08a;cursor:pointer;font-size:13px;font-weight:600;padding:2px 4px;white-space:nowrap;";',
  'btn.onmousedown=function(e){e.preventDefault();};',
  'btn.onclick=function(){',
  '  var sel=window.getSelection();',
  '  if(!sel||!sel.rangeCount||!sel.toString().trim()){tb.style.display="none";return;}',
  '  var text=sel.toString();',
  '  var range=sel.getRangeAt(0);',
  '  var pre="",suf="";',
  '  try{',
  '    var pr=document.createRange();',
  '    pr.setStart(document.body,0);',
  '    pr.setEnd(range.startContainer,range.startOffset);',
  '    pre=pr.toString().slice(-50);',
  '    var sr=document.createRange();',
  '    sr.setStart(range.endContainer,range.endOffset);',
  '    var last=document.body.lastChild;',
  '    if(last)sr.setEndAfter(last);',
  '    suf=sr.toString().slice(0,50);',
  '  }catch(e){}',
  '  tb.style.display="none";',
  '  sel.removeAllRanges();',
  '  window.parent.postMessage({type:"add-highlight",text:text,prefix:pre,suffix:suf},"*");',
  '};',
  'tb.appendChild(btn);',
  'document.body.appendChild(tb);',
  'function showAt(rect){',
  '  tb.style.display="block";',
  '  tb.style.top=Math.max(4,rect.top-40)+"px";',
  '  tb.style.left=Math.max(4,rect.left+rect.width/2-55)+"px";',
  '}',
  'document.addEventListener("mouseup",function(e){',
  '  if(tb.contains(e.target))return;',
  '  setTimeout(function(){',
  '    var sel=window.getSelection();',
  '    if(!sel||!sel.toString().trim()){tb.style.display="none";return;}',
  '    try{showAt(sel.getRangeAt(0).getBoundingClientRect());}catch(e){}',
  '  },10);',
  '});',
  'document.addEventListener("mousedown",function(e){',
  '  if(!tb.contains(e.target))tb.style.display="none";',
  '});',
  'document.addEventListener("keydown",function(e){',
  '  if(e.key==="Escape")tb.style.display="none";',
  '});',
  '})();'
].join('')

/**
 * Walk all visible text nodes in body, concatenate their text, find the
 * highlight's text (disambiguated by prefix), and wrap it in a <mark>.
 * Returns true on success, false if not found or surroundContents throws
 * (e.g., the selection spans element boundaries).
 */
function findAndHighlightText(doc, text, prefix, suffix, highlightId) {
  if (!text || !text.trim()) return false
  const body = doc.body || doc.querySelector('body')
  if (!body) return false

  // Collect non-script/style/mark text nodes.
  const walker = doc.createTreeWalker(body, 0x4 /* SHOW_TEXT */)
  const textNodes = []
  let node
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (parent && /^(script|style|mark)$/i.test(parent.tagName)) continue
    textNodes.push(node)
  }

  const fullText = textNodes.map(n => n.textContent || '').join('')

  // Try to use the prefix to pick the right occurrence.
  let startInFull = -1
  if (prefix) {
    const idx = fullText.indexOf(prefix + text)
    if (idx >= 0) startInFull = idx + prefix.length
  }
  if (startInFull < 0) startInFull = fullText.indexOf(text)
  if (startInFull < 0) return false

  const endInFull = startInFull + text.length

  // Map character positions back to DOM text nodes.
  let charCount = 0
  let startNode = null, startOffset = 0
  let endNode = null, endOffset = 0

  for (const tn of textNodes) {
    const len = (tn.textContent || '').length
    const nodeEnd = charCount + len

    if (startNode === null && startInFull < nodeEnd && startInFull >= charCount) {
      startNode = tn
      startOffset = startInFull - charCount
    }
    if (endNode === null && endInFull <= nodeEnd) {
      endNode = tn
      endOffset = endInFull - charCount
      break
    }
    charCount += len
  }

  if (!startNode || !endNode) return false

  try {
    const range = doc.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)

    const mark = doc.createElement('mark')
    mark.className = 'gb-highlight'
    mark.setAttribute('style', HIGHLIGHT_MARK_STYLE)
    mark.setAttribute('title', 'Click to remove highlight')
    mark.setAttribute('data-highlight-id', String(highlightId))
    mark.setAttribute('onclick', HIGHLIGHT_REMOVE_ONCLICK)
    range.surroundContents(mark)
    return true
  } catch {
    return false
  }
}

/** Re-apply all persisted highlights into the document DOM. */
function injectHighlights(doc, highlights) {
  if (!highlights || !highlights.length) return
  for (const h of highlights) {
    findAndHighlightText(doc, h.text, h.prefix || '', h.suffix || '', h.id)
  }
}

/** Inject the floating "✓ Highlight" selection toolbar script into the body. */
function injectHighlightInteraction(doc) {
  const body = doc.body || doc.querySelector('body')
  if (!body) return
  const script = doc.createElement('script')
  script.textContent = HIGHLIGHT_TOOLBAR_SCRIPT
  body.appendChild(script)
}

/**
 * Main entry point called by reader.js before serialising the chapter to a
 * Blob URL.  Runs SRS injection first, then answer hiding.
 */
export function enhanceChapter(doc, reviewStates = new Map(), highlights = []) {
  injectSrsButtons(doc, reviewStates)
  injectAnswerHiding(doc)
  injectHighlights(doc, highlights)
  injectHighlightInteraction(doc)
}
