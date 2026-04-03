const MIN_EASE_FACTOR = 1.3
const DEFAULT_EASE_FACTOR = 2.5
const DEFAULT_SM2_SETTINGS = {
  minEaseFactor: MIN_EASE_FACTOR,
  defaultEaseFactor: DEFAULT_EASE_FACTOR,
  firstIntervalDays: 1,
  secondIntervalDays: 6,
  hardIntervalMultiplier: 0.8,
  easyIntervalMultiplier: 1.3,
}

function toLocalDateStart(dateLike = new Date()) {
  const d = new Date(dateLike)
  d.setHours(0, 0, 0, 0)
  return d
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
    dueDate: new Date().toISOString(),
    lastReviewedAt: null,
    lastRating: null
  }
}

function normalizeSm2Settings(settings = {}) {
  const merged = { ...DEFAULT_SM2_SETTINGS, ...(settings || {}) }

  return {
    minEaseFactor: Math.max(1, Number(merged.minEaseFactor || DEFAULT_SM2_SETTINGS.minEaseFactor)),
    defaultEaseFactor: Math.max(1, Number(merged.defaultEaseFactor || DEFAULT_SM2_SETTINGS.defaultEaseFactor)),
    firstIntervalDays: Math.max(1, Math.round(Number(merged.firstIntervalDays || DEFAULT_SM2_SETTINGS.firstIntervalDays))),
    secondIntervalDays: Math.max(1, Math.round(Number(merged.secondIntervalDays || DEFAULT_SM2_SETTINGS.secondIntervalDays))),
    hardIntervalMultiplier: Math.max(0.1, Number(merged.hardIntervalMultiplier || DEFAULT_SM2_SETTINGS.hardIntervalMultiplier)),
    easyIntervalMultiplier: Math.max(1, Number(merged.easyIntervalMultiplier || DEFAULT_SM2_SETTINGS.easyIntervalMultiplier)),
  }
}

export function applySm2Rating(review, rating, now = new Date(), settings = {}) {
  const quality = qualityFromRating(rating)
  const config = normalizeSm2Settings(settings)

  let easeFactor = Number(review.easeFactor ?? config.defaultEaseFactor)
  let repetitions = Number(review.repetitions ?? 0)
  let intervalDays = Number(review.intervalDays ?? 0)
  let lapses = Number(review.lapses ?? 0)

  if (quality < 3) {
    repetitions = 0
    intervalDays = config.firstIntervalDays
    lapses += 1
  } else {
    if (repetitions === 0) {
      intervalDays = config.firstIntervalDays
    } else if (repetitions === 1) {
      intervalDays = config.secondIntervalDays
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor))
      if (quality === 3) {
        intervalDays = Math.max(1, Math.round(intervalDays * config.hardIntervalMultiplier))
      } else if (quality === 5) {
        intervalDays = Math.max(1, Math.round(intervalDays * config.easyIntervalMultiplier))
      }
    }
    repetitions += 1
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  easeFactor = Math.max(config.minEaseFactor, Number(easeFactor.toFixed(2)))

  const dueDate = addDays(now, intervalDays).toISOString()

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

export function getDefaultSm2Settings() {
  return { ...DEFAULT_SM2_SETTINGS }
}
