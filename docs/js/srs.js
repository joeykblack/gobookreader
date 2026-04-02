const MIN_EASE_FACTOR = 1.3
const DEFAULT_EASE_FACTOR = 2.5

function toLocalDateStart(dateLike = new Date()) {
  const d = new Date(dateLike)
  d.setHours(0, 0, 0, 0)
  return d
}

function toIsoDate(dateLike = new Date()) {
  const d = toLocalDateStart(dateLike)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(dateLike, days) {
  const d = toLocalDateStart(dateLike)
  d.setDate(d.getDate() + days)
  return d
}

function qualityFromRating(rating) {
  const normalized = String(rating || '').toLowerCase()
  if (normalized === 'again') return 0
  if (normalized === 'hard') return 3
  if (normalized === 'good') return 4
  if (normalized === 'easy') return 5
  throw new Error(`Unknown rating: ${rating}`)
}

export function createReviewItem({ itemId, bookId, chapterFile, sectionName = '', positionOffset = 0 }) {
  return {
    itemId,
    bookId,
    chapterFile,
    sectionName,
    positionOffset,
    createdAt: new Date().toISOString(),
    easeFactor: DEFAULT_EASE_FACTOR,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueDate: toIsoDate(new Date()),
    lastReviewedAt: null,
    lastRating: null
  }
}

export function applySm2Rating(review, rating, now = new Date()) {
  const quality = qualityFromRating(rating)

  let easeFactor = Number(review.easeFactor ?? DEFAULT_EASE_FACTOR)
  let repetitions = Number(review.repetitions ?? 0)
  let intervalDays = Number(review.intervalDays ?? 0)
  let lapses = Number(review.lapses ?? 0)

  if (quality < 3) {
    repetitions = 0
    intervalDays = 1
    lapses += 1
  } else {
    if (repetitions === 0) {
      intervalDays = 1
    } else if (repetitions === 1) {
      intervalDays = 6
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor))
      if (quality === 3) {
        intervalDays = Math.max(1, Math.round(intervalDays * 0.8))
      } else if (quality === 5) {
        intervalDays = Math.max(1, Math.round(intervalDays * 1.3))
      }
    }
    repetitions += 1
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  easeFactor = Math.max(MIN_EASE_FACTOR, Number(easeFactor.toFixed(2)))

  const dueDate = toIsoDate(addDays(now, intervalDays))

  return {
    ...review,
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    dueDate,
    lastReviewedAt: new Date(now).toISOString(),
    lastRating: String(rating)
  }
}
