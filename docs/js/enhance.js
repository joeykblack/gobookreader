/**
 * enhance.js — Post-load DOM enhancements for GoBooks EPUB chapters.
 *
 * Operates on a parsed DOM document before it is serialized to a Blob URL.
 * All injected interactivity uses inline event handlers (no external scripts)
 * because the iframe sandbox allows scripts but not module imports.
 *
 * Pipeline (order matters):
 *  1. injectSrsButtons  — appends SRS rating bar at the end of every section.
 *  2. injectAnswerHiding — wraps answer sections in a hidden div; the SRS bar
 *     injected in step 1 is carried into the wrapper and revealed with the answer.
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

/**
 * Main entry point called by reader.js before serialising the chapter to a
 * Blob URL.  Runs SRS injection first, then answer hiding.
 */
export function enhanceChapter(doc, reviewStates = new Map()) {
  injectSrsButtons(doc, reviewStates)
  injectAnswerHiding(doc)
}
