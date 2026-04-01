/**
 * enhance.js — Post-load DOM enhancements for GoBooks EPUB chapters.
 *
 * Operates on a parsed DOM document before it is serialized to a Blob URL.
 * All injected interactivity uses inline event handlers (no external scripts)
 * because the iframe sandbox allows scripts but not module imports.
 */

const ANSWER_HEADING_RE = /^Answer\b/i
const BTN_STYLE = [
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

/**
 * For each `<h3 class="break">Answer …</h3>` in the document, hides the nodes
 * from that heading up to (but not including) the next h2/h3 sibling, then
 * inserts a "Show Answer" button before the hidden section.
 *
 * Returns the number of answer sections found and hidden.
 */
export function injectAnswerHiding(doc) {
  const answerHeadings = Array.from(doc.querySelectorAll('h3.break')).filter(el =>
    ANSWER_HEADING_RE.test((el.textContent || '').trim())
  )

  if (!answerHeadings.length) {
    return 0
  }

  let count = 0

  answerHeadings.forEach((heading, i) => {
    const body = heading.parentNode
    if (!body) return

    // Collect nodes from this answer heading up to (not including)
    // the next h2 or h3 sibling, or end of body.
    const siblings = Array.from(body.childNodes)
    const startIdx = siblings.indexOf(heading)
    if (startIdx < 0) return

    const answerNodes = []
    for (let j = startIdx; j < siblings.length; j++) {
      const node = siblings[j]
      // Stop before the next h2/h3 that comes AFTER our own heading.
      if (j > startIdx && node.nodeType === 1) {
        const tag = node.tagName.toLowerCase()
        if (tag === 'h2' || tag === 'h3') break
      }
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
    btn.setAttribute('style', BTN_STYLE)

    body.insertBefore(btn, wrapper)
    count++
  })

  return count
}
